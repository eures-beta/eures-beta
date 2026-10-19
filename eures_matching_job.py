"""Resumable matching batches for a single scheduled process, outside HTTP workers."""
import fcntl
import hashlib
import itertools
import json
import os
from pathlib import Path
import tempfile


def _read_table(app, config, table, headers):
    # Grist's omitted limit returns the whole table; never silently truncate at 5,000.
    response = app.requests.get(
        f"{app.GRIST_BASE_URL}/api/docs/{config['doc_id']}/tables/{table}/records",
        headers=headers, timeout=20,
    )
    response.raise_for_status()
    rows = response.json()['records']
    return sorted((row for row in rows if app._is_eures_response_active(row.get('fields') or {})),
                  key=lambda row: int(row['id']))


def _save_state(path, state):
    descriptor, temporary = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(state, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _finalize(app, candidates, needs, counts, headers):
    for role, rows in [('candidate', candidates), ('employer', needs)]:
        for row in rows:
            fields = row['fields']
            # Never reset a pending, sent or dismissed human follow-up on later cycles.
            if not counts.get(f'{role}:{row["id"]}', 0) and not fields.get('no_match_notification_status'):
                app.queue_eures_no_match_notification(role, int(row['id']))
    config = app.get_eures_invitations_config()
    if not config:
        raise RuntimeError('Invitations configuration required to finalize matching.')
    invitation_headers = app._eures_admin_headers(config)
    invitations = _read_table(app, config, config['table_id'], invitation_headers)
    active = {'candidate': {int(row['id']) for row in candidates},
              'employer': {int(row['id']) for row in needs}}
    for invitation in invitations:
        fields = invitation['fields']
        role = fields.get('linked_form_role')
        try:
            linked = int(fields.get('linked_record_id') or 0)
        except (ValueError, TypeError):
            continue
        if linked in active.get(role, set()) and fields.get('matching_status') != 'matching_calcule':
            app.update_eures_invitation_record_by_id(int(invitation['id']), {
                'matching_status': 'matching_calcule',
                'matching_status_updated_at': app._now_iso_utc(),
                'matching_status_updated_by': 'system_matching',
            }, headers=invitation_headers)


def run_matching_batch(app, state_file, max_pairs=100):
    if not 1 <= max_pairs <= 1000:
        raise ValueError('max_pairs must be between 1 and 1000')
    path = Path(state_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_fd = os.open(str(path) + '.lock', os.O_CREAT | os.O_RDWR, 0o600)
    with os.fdopen(lock_fd, 'w') as lock:
        # A single persistent state file coordinates cron overlap on the same host.
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        config = app.get_eures_matching_config()
        if not config or not config.get('api_key'):
            raise RuntimeError('Matching configuration required.')
        headers = app._eures_admin_headers(config)
        candidates = _read_table(app, config, app.EURES_CANDIDATS_TABLE, headers)
        needs = _read_table(app, config, app.EURES_BESOINS_TABLE, headers)
        # Only hashes, row ids, progress and counts are persisted, never source personal data.
        source_data = [[{'id': row['id'], 'fields': {key: value for key, value in row['fields'].items()
                         if not key.startswith('no_match_notification_')}} for row in rows]
                       for rows in (candidates, needs)]
        source_hash = hashlib.sha256(json.dumps(source_data, sort_keys=True).encode()).hexdigest()
        document = hashlib.sha256(config['doc_id'].encode()).hexdigest()
        state = json.loads(path.read_text()) if path.exists() else {}
        if state and state.get('document') != document:
            raise RuntimeError('State belongs to a different Grist document.')
        if not state or state.get('complete'):
            state = {'document': document, 'cursor': [0, 0], 'counts': {}, 'source_hash': source_hash, 'complete': False}
        cursor = tuple(state['cursor'])
        pairs = ((need, candidate) for need in needs for candidate in candidates
                 if (int(need['id']), int(candidate['id'])) > cursor)
        window = list(itertools.islice(pairs, max_pairs + 1))
        for need, candidate in window[:max_pairs]:
            nf, cf = need['fields'], candidate['fields']
            need_key = str(nf.get('id_tally') or nf.get('uuid') or '')
            candidate_key = str(cf.get('id_tally') or cf.get('uuid') or '')
            if need_key and candidate_key:
                matching = app.compute_eures_matching(nf, cf)
                app.upsert_matching_record(config['doc_id'], {
                    'besoin_id': need_key, 'candidat_id': candidate_key, **matching,
                }, headers)
                if matching.get('statut') in {'a_valider', 'auto_envoyable'}:
                    for key in (f'employer:{need["id"]}', f'candidate:{candidate["id"]}'):
                        state['counts'][key] = state['counts'].get(key, 0) + 1
            state['cursor'] = [int(need['id']), int(candidate['id'])]
        complete = len(window) <= max_pairs
        if complete:
            # Persist completed pair counts before follow-up writes: retries must not
            # double-count the last batch or skip failed invitation updates.
            _save_state(path, state)
            # Changed source data is recomputed on the next cycle. Never issue misleading
            # no-match notifications from counts accumulated against different source data.
            if source_hash == state['source_hash']:
                _finalize(app, candidates, needs, state['counts'], headers)
            state['complete'] = True
        _save_state(path, state)
        return {'processed_pairs': min(len(window), max_pairs), 'complete': complete,
                'followup_deferred': complete and source_hash != state['source_hash']}

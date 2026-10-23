"""Read-only EURES public statistics, isolated from the legacy application.

Calculation helpers are selected from production SHA
5d46873e6210956875eb9401596caad137df548a. No legacy app import.
"""

from collections import Counter, defaultdict
from datetime import datetime
import re
import time

# Explicit input contract: identifiers are required only for active-pair filtering.
PUBLIC_STATS_COLUMNS = {
    'candidate': (
        'id_tally',
        'uuid',
        'response_status',
        'tally_submitted_at',
        'metier',
        'mobilite',
    ),
    'employer': (
        'id_tally',
        'uuid',
        'response_status',
        'tally_submitted_at',
        'pays_normalise',
        'poste',
    ),
    'matching': (
        'candidat_id',
        'besoin_id',
        'date_calcul',
        'workflow_status',
        'embauche_confirmee_at',
        'mise_en_relation_at',
        'employer_response',
        'sent_to_employer_at',
        'admin_status',
        'statut',
        'employer_response_at',
        'admin_decision_at',
    ),
    'invitation': ('role', 'invitation_status', 'sent_at'),
    'monthly': (
        'mois',
        'candidats_contactes',
        'candidatures_transmises_employeur',
        'contacts_acceptes_employeur',
        'contacts_refuses_employeur',
        'contacts_sans_reponse_employeur',
        'embauches',
    ),
}

EURES_RESPONSE_ALLOWED_STATUSES = {'active', 'disabled'}

EURES_SECTOR_CANONICAL_MAP = {
    'vente': 'vente',
    'commerce': 'vente',
    'sales': 'vente',
    'retail': 'vente',
    'nettoyage': 'nettoyage',
    'entretien': 'nettoyage',
    'cleaning': 'nettoyage',
    'maintenance': 'nettoyage',
    'hôtellerie': 'hotellerie',
    'hotellerie': 'hotellerie',
    'restauration': 'hotellerie',
    'hospitality': 'hotellerie',
    'catering': 'hotellerie',
    'agriculture': 'agriculture',
    'récolte': 'agriculture',
    'recolte': 'agriculture',
    'harvesting': 'agriculture',
    'industrie': 'industrie_production',
    'industry': 'industrie_production',
    'production': 'industrie_production',
    'opérateur de production': 'industrie_production',
    'operateur de production': 'industrie_production',
    'production operator': 'industrie_production',
    'polyvalent': 'polyvalent',
    'multi': 'polyvalent',
    'accessible rapidement': 'polyvalent',
}

EURES_PUBLIC_SECTOR_LABELS = {
    'vente': 'Vente et commerce',
    'nettoyage': 'Nettoyage et entretien',
    'hotellerie': 'Hôtellerie et restauration',
    'agriculture': 'Agriculture et récolte',
    'polyvalent': 'Missions polyvalentes',
    'industrie_production': 'Production industrielle (assemblage, fabrication, conditionnement, contrôle qualité)',
}

# Only controlled category labels can leave this unauthenticated endpoint.
# Grist cells may contain arbitrary text, including personal information.
PUBLIC_COUNTRIES = {
    'Allemagne',
    'Autriche',
    'Belgique',
    'Bulgarie',
    'Chypre',
    'Croatie',
    'Danemark',
    'Espagne',
    'Estonie',
    'Finlande',
    'France',
    'Grèce',
    'Hongrie',
    'Irlande',
    'Italie',
    'Lettonie',
    'Lituanie',
    'Luxembourg',
    'Malte',
    'Pays-Bas',
    'Pologne',
    'Portugal',
    'Roumanie',
    'Slovaquie',
    'Slovénie',
    'Suède',
    'Tchéquie',
    "Un autre pays de l'UE",
    'Un autre pays hors UE',
}
PUBLIC_MOBILITY_TYPES = {'Transfrontalière', 'Expatriation', 'Les deux'}
PUBLIC_WORKFLOW_STATUSES = {
    'calcule',
    'a_valider_admin',
    'refuse_admin',
    'valide_admin',
    'envoye_employeur',
    'accepte_employeur',
    'refuse_employeur',
    'mise_en_relation_faite',
    'embauche_confirmee',
    'a_valider',
}


def _initial_matching_workflow_status(scoring_status: str) -> str:
    return (
        'a_valider_admin'
        if str(scoring_status or '').strip().lower() in {'a_valider', 'auto_envoyable'}
        else 'calcule'
    )


def _matching_workflow_status(fields: dict) -> str:
    current = str((fields or {}).get('workflow_status') or '').strip().lower()
    if current:
        return current
    if (fields or {}).get('embauche_confirmee_at'):
        return 'embauche_confirmee'
    if (fields or {}).get('mise_en_relation_at'):
        return 'mise_en_relation_faite'
    employer_response = (
        str((fields or {}).get('employer_response') or '').strip().lower()
    )
    if employer_response == 'contact':
        return 'accepte_employeur'
    if employer_response == 'not_contact':
        return 'refuse_employeur'
    if (fields or {}).get('sent_to_employer_at'):
        return 'envoye_employeur'
    admin_status = str((fields or {}).get('admin_status') or '').strip().lower()
    if admin_status == 'accepted':
        return 'envoye_employeur'
    if admin_status == 'refused':
        return 'refuse_admin'
    return _initial_matching_workflow_status((fields or {}).get('statut', ''))


def _month_key(value) -> str | None:
    """Extract YYYY-MM from common timestamp/date values."""
    txt = str(value or '').strip()
    if re.match(r'^\d{4}-(?:0[1-9]|1[0-2])(?:$|[-T ])', txt):
        return txt[:7]
    for fmt in (
        '%Y-%m-%dT%H:%M:%S.%fZ',
        '%Y-%m-%dT%H:%M:%SZ',
        '%Y-%m-%d',
        '%Y/%m/%d',
        '%d/%m/%Y',
    ):
        try:
            return datetime.strptime(txt, fmt).strftime('%Y-%m')
        except Exception:
            continue
    return None


def _parse_datetime(value) -> datetime | None:
    txt = str(value or '').strip()
    if not txt:
        return None
    try:
        return datetime.fromisoformat(txt.replace('Z', '+00:00'))
    except Exception:
        pass
    for fmt in (
        '%Y-%m-%dT%H:%M:%S.%fZ',
        '%Y-%m-%dT%H:%M:%SZ',
        '%Y-%m-%d',
    ):
        try:
            return datetime.strptime(txt, fmt)
        except Exception:
            continue
    return None


def _duration_hours(start_value, end_value) -> float | None:
    start = _parse_datetime(start_value)
    end = _parse_datetime(end_value)
    if not start or not end:
        return None
    delta_seconds = (end - start).total_seconds()
    if delta_seconds < 0:
        return None
    return delta_seconds / 3600.0


def _duration_summary(values: list[float]) -> dict:
    ordered = sorted(v for v in values if v is not None)
    if not ordered:
        return {
            'count': 0,
            'avg_hours': None,
            'median_hours': None,
            'min_hours': None,
            'max_hours': None,
        }
    count = len(ordered)
    middle = count // 2
    median = (
        ordered[middle] if count % 2 else (ordered[middle - 1] + ordered[middle]) / 2.0
    )
    return {
        'count': count,
        'avg_hours': round(sum(ordered) / count, 1),
        'median_hours': round(median, 1),
        'min_hours': round(ordered[0], 1),
        'max_hours': round(ordered[-1], 1),
    }


def _split_multi_value(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        raw_items = value
    else:
        raw_items = str(value).split('|')
    return [str(item).strip() for item in raw_items if str(item).strip()]


def _clean_public_label(label: str) -> str:
    return ' '.join(str(label or '').strip().split())


def _public_breakdown_label(kind: str, label: str) -> str:
    """Normalize raw stored values into cleaner public labels."""
    cleaned = _clean_public_label(label)
    lowered = cleaned.lower()
    humanized = cleaned.replace('_', ' ')

    if kind == 'matchings_par_statut':
        return {
            'calcule': 'Calcule',
            'a_valider_admin': 'A valider admin',
            'refuse_admin': 'Refuse admin',
            'valide_admin': 'Valide admin',
            'envoye_employeur': 'Envoye employeur',
            'accepte_employeur': 'Accepte employeur',
            'refuse_employeur': 'Refuse employeur',
            'mise_en_relation_faite': 'Mise en relation faite',
            'embauche_confirmee': 'Embauche confirmee',
            'a_valider': 'A valider',
        }.get(lowered, humanized[:1].upper() + humanized[1:])

    if kind == 'mobilite_candidats':
        if ':' in cleaned:
            prefix, raw_value = [part.strip() for part in cleaned.split(':', 1)]
            prefix_l = prefix.lower()
            if prefix_l == 'type':
                return raw_value
            if prefix_l in {'pays souhaités', 'pays souhaites'}:
                return f'Pays vises : {raw_value}'
            if prefix_l in {'expérience pays', 'experience pays'}:
                return f'Experience dans : {raw_value}'
        return cleaned[:1].upper() + cleaned[1:]

    if kind == 'experience_internationale_candidats':
        if ':' in cleaned:
            prefix, raw_value = [part.strip() for part in cleaned.split(':', 1)]
            prefix_l = prefix.lower()
            if prefix_l in {'expérience pays', 'experience pays'}:
                return f'Experience dans : {raw_value}'
        return cleaned[:1].upper() + cleaned[1:]

    if kind == 'retours_employeurs':
        return {
            'contact': 'Accepté par employeur',
            'not_contact': 'Refusé par employeur',
            'no_response': 'Sans réponse',
        }.get(lowered, cleaned[:1].upper() + cleaned[1:])

    return cleaned


def _counter_to_rows(counter: Counter) -> list[dict]:
    """Convert a counter to public rows without collapsing categories."""
    return [
        {'label': label, 'count': count}
        for label, count in sorted(
            counter.items(), key=lambda item: (-item[1], str(item[0]).lower())
        )
    ]


def _add_public_counter(counter: Counter, kind: str, raw_label: str):
    cleaned = _clean_public_label(raw_label)
    if kind == 'besoins_par_pays' and cleaned not in PUBLIC_COUNTRIES:
        return
    if (
        kind == 'matchings_par_statut'
        and cleaned.lower() not in PUBLIC_WORKFLOW_STATUSES
    ):
        return
    if kind in {'mobilite_candidats', 'experience_internationale_candidats'}:
        if ':' in cleaned:
            prefix, value = [part.strip() for part in cleaned.split(':', 1)]
            if prefix.lower() == 'type':
                if kind != 'mobilite_candidats' or value not in PUBLIC_MOBILITY_TYPES:
                    return
            elif prefix.lower() in {
                'pays souhaités',
                'pays souhaites',
                'pays vises',
                'expérience pays',
                'experience pays',
                'experience dans',
            }:
                if value not in PUBLIC_COUNTRIES:
                    return
            else:
                return
        elif kind != 'mobilite_candidats' or cleaned not in PUBLIC_MOBILITY_TYPES:
            return
    public_label = _public_breakdown_label(kind, raw_label)
    if public_label:
        counter[public_label] += 1


def _eures_public_sector_labels(value) -> list[str]:
    sectors = eures_candidate_sectors(str(value or ''))
    return [
        EURES_PUBLIC_SECTOR_LABELS[sector]
        for sector in EURES_PUBLIC_SECTOR_LABELS
        if sector in sectors
    ]


def _eures_public_mobility_labels(value) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    for part in _split_multi_value(value):
        if ':' in part:
            prefix, raw_values = [chunk.strip() for chunk in part.split(':', 1)]
            values = [item.strip() for item in raw_values.split(',') if item.strip()]
            if not values:
                values = [raw_values.strip()] if raw_values.strip() else []
            for item in values:
                if prefix.lower() == 'type':
                    label = item
                elif prefix.lower() in {'pays souhaités', 'pays souhaites'}:
                    label = f'Pays vises : {item}'
                else:
                    continue
                if label and label not in seen:
                    seen.add(label)
                    labels.append(label)
        else:
            for item in [
                chunk.strip() for chunk in str(part).split(',') if chunk.strip()
            ]:
                if item and item not in seen:
                    seen.add(item)
                    labels.append(item)
    return labels


def _eures_public_experience_labels(value) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    for part in _split_multi_value(value):
        if ':' not in part:
            continue
        prefix, raw_values = [chunk.strip() for chunk in part.split(':', 1)]
        if prefix.lower() not in {'expérience pays', 'experience pays'}:
            continue
        values = [item.strip() for item in raw_values.split(',') if item.strip()]
        if not values:
            values = [raw_values.strip()] if raw_values.strip() else []
        for item in values:
            label = f'Experience dans : {item}'
            if label and label not in seen:
                seen.add(label)
                labels.append(label)
    return labels


def _safe_int(value) -> int:
    try:
        return int(float(value or 0))
    except Exception:
        return 0


def build_eures_public_stats(repository) -> dict:
    """Build a public, non-nominative stats payload for EURES beta."""
    candidats = repository.list_public_stats_records('candidate')
    besoins = repository.list_public_stats_records('employer')
    matchings = repository.list_public_stats_records('matching')
    # Only three invitation fields are needed; never project contact details.
    invitations = [
        {
            'role': (record.get('fields') or {}).get('role'),
            'invitation_status': (record.get('fields') or {}).get(
                'invitation_status', 'invitation_a_envoyer'
            ),
            'sent_at': (record.get('fields') or {}).get('sent_at'),
        }
        for record in repository.list_public_stats_records('invitation')
    ]

    monthly: dict[str, dict[str, int | str]] = defaultdict(
        lambda: {
            'mois': '',
            'candidats': 0,
            'besoins_employeurs': 0,
            'matchings': 0,
            'candidats_contactes': 0,
            'candidatures_transmises_employeur': 0,
            'contacts_acceptes_employeur': 0,
            'contacts_refuses_employeur': 0,
            'contacts_sans_reponse_employeur': 0,
            'embauches': 0,
        }
    )

    besoins_par_pays = Counter()
    secteurs = Counter()
    mobilite_candidats = Counter()
    experience_internationale_candidats = Counter()
    matchings_par_statut = Counter()
    retours_employeurs = Counter()
    delays = {
        'calcul_to_admin': [],
        'admin_to_send': [],
        'send_to_employer_response': [],
        'response_to_relation': [],
        'relation_to_hire': [],
    }
    active_candidate_keys = {
        str(
            (rec.get('fields') or {}).get('id_tally')
            or (rec.get('fields') or {}).get('uuid')
            or ''
        ).strip()
        for rec in candidats
        if isinstance(rec, dict)
        and _is_eures_response_active((rec.get('fields') or {}))
    }
    active_employer_keys = {
        str(
            (rec.get('fields') or {}).get('id_tally')
            or (rec.get('fields') or {}).get('uuid')
            or ''
        ).strip()
        for rec in besoins
        if isinstance(rec, dict)
        and _is_eures_response_active((rec.get('fields') or {}))
    }

    for rec in candidats:
        fields = rec.get('fields', {}) if isinstance(rec, dict) else {}
        month = _month_key(fields.get('tally_submitted_at'))
        if month:
            monthly[month]['mois'] = month
            monthly[month]['candidats'] += 1
        for label in _eures_public_sector_labels(fields.get('metier')):
            _add_public_counter(secteurs, 'secteurs', label)
        for label in _eures_public_mobility_labels(fields.get('mobilite')):
            _add_public_counter(mobilite_candidats, 'mobilite_candidats', label)
        for label in _eures_public_experience_labels(fields.get('mobilite')):
            _add_public_counter(
                experience_internationale_candidats,
                'experience_internationale_candidats',
                label,
            )

    for rec in besoins:
        fields = rec.get('fields', {}) if isinstance(rec, dict) else {}
        month = _month_key(fields.get('tally_submitted_at'))
        if month:
            monthly[month]['mois'] = month
            monthly[month]['besoins_employeurs'] += 1
        for label in _split_multi_value(fields.get('pays_normalise')):
            _add_public_counter(besoins_par_pays, 'besoins_par_pays', label)
        for label in _eures_public_sector_labels(fields.get('poste')):
            _add_public_counter(secteurs, 'secteurs', label)

    for row in invitations:
        if str(row.get('role') or '').strip().lower() != 'candidate':
            continue
        if (
            str(row.get('invitation_status') or '').strip().lower()
            != 'invitation_envoyee'
        ):
            continue
        sent_month = _month_key(row.get('sent_at'))
        if sent_month:
            monthly[sent_month]['mois'] = sent_month
            monthly[sent_month]['candidats_contactes'] += 1

    for rec in matchings:
        fields = rec.get('fields', {}) if isinstance(rec, dict) else {}
        candidat_id = str(fields.get('candidat_id') or '').strip()
        besoin_id = str(fields.get('besoin_id') or '').strip()
        if (
            candidat_id not in active_candidate_keys
            or besoin_id not in active_employer_keys
        ):
            continue
        month = _month_key(fields.get('date_calcul'))
        if month:
            monthly[month]['mois'] = month
            monthly[month]['matchings'] += 1
        workflow_status = _matching_workflow_status(fields)
        if workflow_status:
            _add_public_counter(
                matchings_par_statut, 'matchings_par_statut', workflow_status
            )

        sent_month = _month_key(fields.get('sent_to_employer_at'))
        if sent_month:
            monthly[sent_month]['mois'] = sent_month
            monthly[sent_month]['candidatures_transmises_employeur'] += 1

        relation_month = _month_key(fields.get('mise_en_relation_at'))
        if relation_month:
            monthly[relation_month]['mois'] = relation_month
            monthly[relation_month]['candidats_contactes'] += 1

        hire_month = _month_key(fields.get('embauche_confirmee_at'))
        if hire_month:
            monthly[hire_month]['mois'] = hire_month
            monthly[hire_month]['embauches'] += 1

        response_bucket = None
        response_month = None
        if workflow_status in {
            'accepte_employeur',
            'mise_en_relation_faite',
            'embauche_confirmee',
        }:
            response_bucket = 'contact'
            response_month = _month_key(
                fields.get('employer_response_at')
                or fields.get('mise_en_relation_at')
                or fields.get('embauche_confirmee_at')
            )
        elif workflow_status == 'refuse_employeur':
            response_bucket = 'not_contact'
            response_month = _month_key(fields.get('employer_response_at'))
        elif workflow_status == 'envoye_employeur':
            response_bucket = 'no_response'
            response_month = sent_month

        if response_bucket:
            _add_public_counter(
                retours_employeurs, 'retours_employeurs', response_bucket
            )
            if response_month:
                monthly[response_month]['mois'] = response_month
                if response_bucket == 'contact':
                    monthly[response_month]['contacts_acceptes_employeur'] += 1
                elif response_bucket == 'not_contact':
                    monthly[response_month]['contacts_refuses_employeur'] += 1
                else:
                    monthly[response_month]['contacts_sans_reponse_employeur'] += 1

        duration = _duration_hours(
            fields.get('date_calcul'), fields.get('admin_decision_at')
        )
        if duration is not None:
            delays['calcul_to_admin'].append(duration)
        duration = _duration_hours(
            fields.get('admin_decision_at'), fields.get('sent_to_employer_at')
        )
        if duration is not None:
            delays['admin_to_send'].append(duration)
        duration = _duration_hours(
            fields.get('sent_to_employer_at'), fields.get('employer_response_at')
        )
        if duration is not None:
            delays['send_to_employer_response'].append(duration)
        duration = _duration_hours(
            fields.get('employer_response_at'), fields.get('mise_en_relation_at')
        )
        if duration is not None:
            delays['response_to_relation'].append(duration)
        duration = _duration_hours(
            fields.get('mise_en_relation_at'), fields.get('embauche_confirmee_at')
        )
        if duration is not None:
            delays['relation_to_hire'].append(duration)

    manual_stats_available = False
    try:
        manual_rows = repository.list_public_stats_records('monthly')
        manual_stats_available = True
    except Exception:
        manual_rows = []
    for rec in manual_rows:
        fields = rec.get('fields', {}) if isinstance(rec, dict) else {}
        month = _month_key(fields.get('mois'))
        if not month:
            continue
        monthly[month]['mois'] = month
        monthly[month]['candidats_contactes'] += _safe_int(
            fields.get('candidats_contactes')
        )
        monthly[month]['candidatures_transmises_employeur'] += _safe_int(
            fields.get('candidatures_transmises_employeur')
        )
        monthly[month]['contacts_acceptes_employeur'] += _safe_int(
            fields.get('contacts_acceptes_employeur')
        )
        monthly[month]['contacts_refuses_employeur'] += _safe_int(
            fields.get('contacts_refuses_employeur')
        )
        monthly[month]['contacts_sans_reponse_employeur'] += _safe_int(
            fields.get('contacts_sans_reponse_employeur')
        )
        monthly[month]['embauches'] += _safe_int(fields.get('embauches'))

    monthly_rows = [row for _, row in sorted(monthly.items()) if row.get('mois')]

    totals = {
        'candidats': len(candidats),
        'besoins_employeurs': len(besoins),
        'matchings': len(matchings),
        'candidats_contactes': sum(
            int(row['candidats_contactes']) for row in monthly_rows
        ),
        'candidatures_transmises_employeur': sum(
            int(row['candidatures_transmises_employeur']) for row in monthly_rows
        ),
        'contacts_acceptes_employeur': sum(
            int(row['contacts_acceptes_employeur']) for row in monthly_rows
        ),
        'contacts_refuses_employeur': sum(
            int(row['contacts_refuses_employeur']) for row in monthly_rows
        ),
        'contacts_sans_reponse_employeur': sum(
            int(row['contacts_sans_reponse_employeur']) for row in monthly_rows
        ),
        'embauches': sum(int(row['embauches']) for row in monthly_rows),
    }

    return {
        'ok': True,
        'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'manual_stats_table': {
            'configured': manual_stats_available,
            'table_id': repository.stats_table,
        },
        'totals': totals,
        'durations': {
            'calcul_to_admin': _duration_summary(delays['calcul_to_admin']),
            'admin_to_send': _duration_summary(delays['admin_to_send']),
            'send_to_employer_response': _duration_summary(
                delays['send_to_employer_response']
            ),
            'response_to_relation': _duration_summary(delays['response_to_relation']),
            'relation_to_hire': _duration_summary(delays['relation_to_hire']),
        },
        'monthly': monthly_rows,
        'breakdowns': {
            'besoins_par_pays': _counter_to_rows(besoins_par_pays),
            'secteurs': _counter_to_rows(secteurs),
            'mobilite_candidats': _counter_to_rows(mobilite_candidats),
            'experience_internationale_candidats': _counter_to_rows(
                experience_internationale_candidats
            ),
            'matchings_par_statut': _counter_to_rows(matchings_par_statut),
            'retours_employeurs': _counter_to_rows(retours_employeurs),
        },
    }


def eures_normalize_text(value) -> str:
    return str(value or '').strip().lower()


def eures_candidate_sectors(value: str) -> set[str]:
    value_l = eures_normalize_text(value)
    return {
        sector
        for token, sector in EURES_SECTOR_CANONICAL_MAP.items()
        if token in value_l
    }


def _normalize_eures_response_status(value: str) -> str:
    status = str(value or '').strip().lower()
    return status if status in EURES_RESPONSE_ALLOWED_STATUSES else ''


def _is_eures_response_active(fields: dict) -> bool:
    status = _normalize_eures_response_status((fields or {}).get('response_status', ''))
    return status != 'disabled'

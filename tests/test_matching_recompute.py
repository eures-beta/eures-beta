import fcntl
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import app
import eures_matching_job as job


class MatchingJobTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.state = Path(self.directory.name) / 'progress.json'
        self.candidates = [{'id': i, 'fields': {'id_tally': f'c{i}'}} for i in range(1, 4)]
        self.needs = [{'id': 1, 'fields': {'id_tally': 'b1'}}]
        for target, value in [('get_eures_matching_config', {'doc_id': 'fictional', 'api_key': 'fictional'}),
                              ('get_eures_invitations_config', {'doc_id': 'fictional', 'table_id': 'Invitations', 'api_key': 'fictional'})]:
            mock = patch.object(app, target, return_value=value); mock.start();self.addCleanup(mock.stop)
        self.write = patch.object(app, 'upsert_matching_record');self.upsert = self.write.start();self.addCleanup(self.write.stop)
        self.notify = patch.object(app, 'queue_eures_no_match_notification');self.queue = self.notify.start();self.addCleanup(self.notify.stop)
        mock = patch.object(app, 'compute_eures_matching', return_value={'statut': 'non_retenu'});mock.start();self.addCleanup(mock.stop)
        self.read = patch.object(job, '_read_table', side_effect=lambda a, c, table, h: self.candidates if table == app.EURES_CANDIDATS_TABLE else self.needs if table == app.EURES_BESOINS_TABLE else [])
        self.read.start();self.addCleanup(self.read.stop)

    def test_capped_runs_resume_and_finalize_only_after_complete(self):
        self.assertFalse(job.run_matching_batch(app, self.state, 1)['complete'])
        self.queue.assert_not_called()
        self.assertFalse(job.run_matching_batch(app, self.state, 1)['complete'])
        self.assertTrue(job.run_matching_batch(app, self.state, 1)['complete'])
        self.assertEqual([call.args[1]['candidat_id'] for call in self.upsert.call_args_list], ['c1', 'c2', 'c3'])
        self.assertEqual(self.queue.call_count, 4)
        self.assertEqual(self.state.stat().st_mode & 0o777, 0o600)
        self.assertNotIn('api_key', self.state.read_text())

    def test_changed_source_preserves_progress_but_defers_followup(self):
        job.run_matching_batch(app, self.state, 1)
        self.candidates[0]['fields']['nom'] = 'Fictional updated candidate'
        job.run_matching_batch(app, self.state, 1)
        result = job.run_matching_batch(app, self.state, 1)
        self.assertTrue(result['followup_deferred'])
        self.assertEqual(self.upsert.call_args.args[1]['candidat_id'], 'c3')
        self.queue.assert_not_called()

    def test_failed_write_does_not_advance_checkpoint(self):
        job.run_matching_batch(app, self.state, 1)
        checkpoint = self.state.read_text()
        self.upsert.side_effect = RuntimeError('fictional error')
        with self.assertRaises(RuntimeError):job.run_matching_batch(app, self.state, 1)
        self.assertEqual(self.state.read_text(), checkpoint)

    def test_overlapping_jobs_are_rejected(self):
        with open(str(self.state) + '.lock', 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):job.run_matching_batch(app, self.state, 1)
        self.upsert.assert_not_called()

    def test_no_batch_web_endpoint_is_exposed(self):
        self.assertEqual(app.app.test_client().post('/api/forms/eures-beta/admin/recompute-matchings').status_code, 404)

    def test_table_reader_has_timeout_and_no_truncation_limit(self):
        self.read.stop()
        response = Mock(json=lambda: {'records': self.candidates + [{'id': 8, 'fields': {'response_status': 'disabled'}}]})
        with patch.object(app.requests, 'get', return_value=response) as get:
            self.assertEqual(len(job._read_table(app, {'doc_id': 'fictional'}, 'Candidats', {})), 3)
        self.assertEqual(get.call_args.kwargs['timeout'], 20)
        self.assertNotIn('params', get.call_args.kwargs)

    def test_cli_failure_does_not_print_sensitive_exception(self):
        with patch.object(job, 'run_matching_batch', side_effect=RuntimeError('fictional-secret')):
            result = app.app.test_cli_runner().invoke(args=['recompute-eures-matchings', '--state-file', str(self.state)])
        self.assertNotEqual(result.exit_code, 0)
        self.assertNotIn('fictional-secret', result.output)

    def test_finalization_retry_preserves_counts_and_human_status(self):
        self.queue.side_effect = RuntimeError('fictional finalization failure')
        with self.assertRaises(RuntimeError):job.run_matching_batch(app, self.state, 10)
        self.assertEqual(self.upsert.call_count, 3)
        self.queue.side_effect = None
        self.assertTrue(job.run_matching_batch(app, self.state, 10)['complete'])
        self.assertEqual(self.upsert.call_count, 3)

    def test_finalize_preserves_sent_notification_and_updates_linked_invitation(self):
        self.candidates[0]['fields']['no_match_notification_status'] = 'sent'
        invitations = [{'id': 99, 'fields': {'linked_form_role': 'candidate', 'linked_record_id': '1'}}]
        with patch.object(job, '_read_table', return_value=invitations), patch.object(app, 'update_eures_invitation_record_by_id') as update:
            job._finalize(app, self.candidates, self.needs, {}, {})
        self.assertNotIn(('candidate', 1), [call.args for call in self.queue.call_args_list])
        self.assertEqual(update.call_args.args[1]['matching_status'], 'matching_calcule')
        self.assertNotIn('submission_count', update.call_args.args[1])

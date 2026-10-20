import unittest
from collections import Counter
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import requests
import app


class AdminLoadingTest(unittest.TestCase):
    def setUp(self):
        self.headers = {'Authorization': 'Bearer fictional'}
        self.records = [{'id': 1, 'fields': {'label': 'fictional'}}]
        self.response = Mock(status_code=200)
        self.response.json.return_value = {'records': self.records}

    def read(self, **kwargs):
        return app.fetch_table_records('fictional-doc', 'Table', self.headers, **kwargs)

    def test_snapshot_reuses_reads_and_isolates_mutations(self):
        @app.reuse_admin_grist_reads
        def build():
            first = self.read()
            first[0]['fields']['label'] = 'changed locally'
            second = self.read()
            second[0]['fields']['label'] = 'changed again'
            return self.read()

        with patch.object(app.requests, 'get', return_value=self.response) as get:
            self.assertEqual(build()[0]['fields']['label'], 'fictional')
        get.assert_called_once()
        self.assertEqual(get.call_args.kwargs['timeout'], (3.05, 15))
        self.assertIsNone(app._ADMIN_GRIST_READS.get())

    def test_snapshot_does_not_cross_builds_or_credentials_or_limits(self):
        @app.reuse_admin_grist_reads
        def build():
            self.read()
            self.read(limit=10)
            app.fetch_table_records('fictional-doc', 'Table', {'Authorization': 'other'})
            app.fetch_table_records('other-doc', 'Table', self.headers)
            app.fetch_table_records('fictional-doc', 'OtherTable', self.headers)

        with patch.object(app.requests, 'get', return_value=self.response) as get:
            build()
            build()
        self.assertEqual(get.call_count, 10)

    def test_failure_does_not_leave_snapshot_active_or_cache_error(self):
        @app.reuse_admin_grist_reads
        def build():
            return self.read()

        with patch.object(app.requests, 'get', side_effect=requests.Timeout):
            with self.assertRaises(requests.Timeout):
                build()
        self.assertIsNone(app._ADMIN_GRIST_READS.get())
        with patch.object(app.requests, 'get', return_value=self.response) as get:
            self.assertEqual(build(), self.records)
        get.assert_called_once()

    def test_nested_builds_share_only_current_snapshot(self):
        @app.reuse_admin_grist_reads
        def inner():
            return self.read()

        @app.reuse_admin_grist_reads
        def outer():
            self.read()
            return inner()

        with patch.object(app.requests, 'get', return_value=self.response) as get:
            outer()
            inner()
        self.assertEqual(get.call_count, 2)

    def test_concurrent_builds_do_not_share_snapshots(self):
        barrier = Barrier(2)

        @app.reuse_admin_grist_reads
        def build():
            self.read()
            barrier.wait(timeout=5)
            return self.read()

        with patch.object(app.requests, 'get', return_value=self.response) as get:
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: build(), range(2)))
        self.assertEqual(get.call_count, 2)
        self.assertEqual(results[0], results[1])
        self.assertIsNone(app._ADMIN_GRIST_READS.get())

    def test_real_builders_read_each_table_once_and_preserve_results(self):
        def config(_form, role=None):
            return {'doc_id': 'fictional-doc', 'api_key': 'fictional',
                    'table_id': app.EURES_BESOINS_TABLE if role == 'employer' else app.EURES_CANDIDATS_TABLE}

        records = {
            app.EURES_CANDIDATS_TABLE: [{'id': 1, 'fields': {
                'id_tally': 'candidate-1', 'nom': 'Fictional', 'email': 'fictional@example.org'}}],
            app.EURES_BESOINS_TABLE: [{'id': 2, 'fields': {
                'id_tally': 'need-1', 'employeur': 'Fictional employer', 'poste': 'Fictional job'}}],
            app.EURES_MATCHINGS_TABLE: [{'id': 3, 'fields': {
                'candidat_id': 'candidate-1', 'besoin_id': 'need-1', 'statut': 'a_valider', 'score': 70}}],
        }

        def response(url, **_kwargs):
            table = url.split('/')[-2]
            return Mock(status_code=200, json=lambda: {'records': records.get(table, [])})

        for builder in (app.build_eures_admin_tasks, app.build_eures_cockpit_summary):
            with self.subTest(builder=builder.__name__), \
                    patch.object(app, 'get_form_config', side_effect=config), \
                    patch.object(app.requests, 'get', side_effect=response) as get:
                actual = builder()
                counts = Counter(call.args[0] for call in get.call_args_list)
                self.assertEqual(len(counts), 4)
                self.assertTrue(all(count == 1 for count in counts.values()), counts)
                get.reset_mock()
                # Compare to the exact previous behavior with snapshot reuse disabled.
                if builder is app.build_eures_cockpit_summary:
                    with patch.object(app, 'build_eures_admin_tasks', app.build_eures_admin_tasks.__wrapped__):
                        expected = builder.__wrapped__()
                else:
                    expected = builder.__wrapped__()
                self.assertEqual(actual, expected)
                self.assertGreater(get.call_count, 4)


if __name__ == '__main__':
    unittest.main()

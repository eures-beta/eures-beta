import base64
import json
import unittest
from unittest.mock import patch, Mock
import app


class NetworkTest(unittest.TestCase):
    def setUp(self):
        env = patch.dict(app.os.environ, {
            'ADMIN_AUTH_MODE_EURES_BETA': 'hybrid',
            'ADMIN_ALLOWED_EMAILS_EURES_BETA': 'eric@example.org,bob@example.org',
            'ADMIN_NETWORK_ALLOWED_EMAILS_EURES_BETA': '',
            'ADMIN_USERNAME_EURES_BETA': 'shared',
            'ADMIN_PASSWORD_EURES_BETA': 'password',
        })
        env.start()
        self.addCleanup(env.stop)
        proxy = patch.object(app, 'maybe_proxy_eures_request', return_value=None)
        proxy.start()
        self.addCleanup(proxy.stop)
        self.users = [{'fields': {'Utilisateur_ID': 'fictional-eric', 'Email': 'eric@example.org',
            'Actif': True, 'Role': 'administrateur', 'Version_session': 1}},
            {'fields': {'Utilisateur_ID': 'fictional-bob', 'Email': 'bob@example.org',
            'Actif': True, 'Role': 'reader', 'Version_session': 1}}]
        self.roles = [{'fields': {'Code': 'administrateur', 'Nom': 'Administrateur',
            'Permissions': '["reseau.read"]'}}, {'fields': {'Code': 'reader', 'Permissions': '[]'}}]
        reader = patch.object(app, '_eures_permission_reader', return_value=lambda: (self.users, self.roles))
        reader.start()
        self.addCleanup(reader.stop)
        self.client = app.app.test_client()
        self.api = '/api/forms/eures-beta/admin/reseau/contacts'
        self.record = {'id': 7, 'fields': {'Nom': 'Test', 'Prenom': 'Alice', 'Email': 'private@example.org', 'Notes': 'secret note', 'Newsletter_statut': 'Non sollicité', 'Unexpected': 'secret extra'}}

    def login(self, email='eric@example.org'):
        with self.client.session_transaction() as session:
            session['admin_session:eures-beta'] = {'email': email, 'authenticated_at': app._now_iso_utc(), 'Version_session': 1}

    @patch.object(app, '_network_records')
    def test_denied_requests_never_read_grist(self, records):
        self.assertEqual(self.client.get(self.api).status_code, 403)
        basic = base64.b64encode(b'shared:password').decode()
        self.assertEqual(self.client.get(self.api, headers={'Authorization': 'Basic ' + basic}).status_code, 403)
        self.login('bob@example.org')
        self.assertEqual(self.client.get(self.api).status_code, 403)
        self.assertEqual(self.client.get('/admin/eures-beta/reseau').status_code, 403)
        records.assert_not_called()

    @patch.object(app, '_network_records')
    def test_revoked_expired_and_default_closed(self, records):
        self.login()
        with patch.dict(app.os.environ, {'ADMIN_NETWORK_ALLOWED_EMAILS_EURES_BETA': ''}):
            with patch.object(app, '_network_records', return_value=[]):
                self.assertEqual(self.client.get(self.api).status_code, 200)
        with patch.dict(app.os.environ, {'ADMIN_ALLOWED_EMAILS_EURES_BETA': 'bob@example.org'}):
            self.assertEqual(self.client.get(self.api).status_code, 403)
        with self.client.session_transaction() as session:
            session['admin_session:eures-beta'] = {'email': 'eric@example.org', 'authenticated_at': '2000-01-01T00:00:00+00:00'}
        self.assertEqual(self.client.get(self.api).status_code, 403)
        records.assert_not_called()

    def test_list_minimization_and_detail_audit(self):
        self.login()
        with patch.object(app, '_network_records', return_value=[self.record]), self.assertLogs(app.app.logger, level='WARNING') as logs:
            response = self.client.get(self.api)
            self.assertEqual(response.status_code, 200)
            self.assertNotIn('Email', response.json['contacts'][0])
            self.assertNotIn('Newsletter_statut', response.json['contacts'][0])
            detail = self.client.get(self.api + '/7')
        self.assertEqual(detail.json['contact']['Newsletter_statut'], 'Non sollicité')
        self.assertNotIn('Unexpected', detail.json['contact'])
        self.assertEqual(detail.headers['Cache-Control'], 'no-store, private')
        event = json.loads(logs.records[-1].getMessage().split('network_audit ', 1)[1])
        self.assertEqual(set(event), {'user', 'action', 'target', 'timestamp'})
        self.assertEqual(event['user'], 'eric@example.org')
        self.assertEqual(event['action'], 'view')
        self.assertEqual(event['target'], 'Contacts_Initiative/7')
        self.assertNotIn('secret', str(logs.output))

    def test_missing_failure_and_no_success_audit(self):
        self.login()
        with patch.object(app, '_network_records', return_value=[]), patch.object(app, '_network_audit') as audit:
            self.assertEqual(self.client.get(self.api + '/7').status_code, 404)
            audit.assert_not_called()
        with patch.object(app, '_network_records', side_effect=RuntimeError('sensitive upstream body')), self.assertLogs(app.app.logger) as logs:
            response = self.client.get(self.api)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('sensitive', response.text + str(logs.output))

    def test_writes_exports_and_wrong_form_unavailable(self):
        self.login()
        with patch.object(app, '_network_records') as records:
            for method in ['put', 'delete']:
                for url in [self.api, self.api + '/7']:
                    self.assertEqual(getattr(self.client, method)(url, json={'Newsletter_statut': 'Accepté'}).status_code, 405)
            self.assertEqual(self.client.get(self.api + '/export').status_code, 404)
            self.assertEqual(self.client.get(self.api.replace('eures-beta', 'other')).status_code, 404)
            records.assert_not_called()

    def test_page_and_capability(self):
        self.login()
        response = self.client.get('/admin/eures-beta/reseau')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Réseau', response.text)
        response.close()
        self.assertTrue(self.client.get(self.api.replace('contacts', 'access')).json['allowed'])
        self.login('bob@example.org')
        self.assertEqual(self.client.get(self.api.replace('contacts', 'access')).status_code, 403)

    def test_grist_transport_is_fixed_table_read_only(self):
        with patch.object(app, 'get_form_config', return_value={'doc_id': 'doc', 'api_key': 'token'}), patch.object(app.requests, 'get') as get:
            get.return_value = Mock(json=lambda: {'records': [self.record]})
            self.assertEqual(app._network_records(7), [self.record])
            args, kwargs = get.call_args
            self.assertTrue(args[0].endswith('/tables/Contacts_Initiative/records'))
            self.assertEqual(json.loads(kwargs['params']['filter']), {'id': [7]})
            self.assertEqual(kwargs['timeout'], 20)
            get.return_value = Mock(json=lambda: {'records': [self.record] * 5001})
            with self.assertRaises(RuntimeError):
                app._network_records()

    def test_all_surfaces_central_authorization_matrix(self):
        urls = ['/admin/eures-beta/reseau', self.api.replace('contacts', 'access'), self.api, self.api + '/7']
        for case in ['authorized', 'no_permission', 'missing_version', 'wrong_version', 'inactive', 'unavailable', 'basic', 'fallback', 'expired']:
            with self.subTest(case=case):
                self.login()
                self.users[0]['fields']['Actif'] = case != 'inactive'
                self.roles[0]['fields']['Permissions'] = '[]' if case == 'no_permission' else '["reseau.read"]'
                with self.client.session_transaction() as session:
                    personal = session['admin_session:eures-beta']
                    if case == 'missing_version': personal.pop('Version_session')
                    if case == 'wrong_version': personal['Version_session'] = 2
                    if case == 'expired': personal['authenticated_at'] = '2000-01-01T00:00:00+00:00'
                    if case == 'fallback': personal['email'] = 'admin'
                    session['admin_session:eures-beta'] = personal
                    if case == 'basic': session.clear()
                def reader():
                    if case == 'unavailable': raise RuntimeError('private upstream secret')
                    return self.users, self.roles
                expected = 200 if case == 'authorized' else 503 if case == 'unavailable' else 403
                with patch.object(app, '_eures_permission_reader', return_value=reader), patch.object(app, '_network_records', return_value=[self.record]) as records, patch.object(app, '_network_audit') as audit, patch.object(app, 'maybe_proxy_eures_request', return_value=None) as proxy:
                    for url in urls:
                        response = self.client.get(url + '?search=private-search', headers={'Authorization': 'Basic ' + base64.b64encode(b'shared:password').decode()})
                        self.assertEqual(response.status_code, expected)
                        self.assertEqual(response.headers['Cache-Control'], 'no-store, private')
                        if expected != 200:
                            self.assertEqual(response.json, {'error': 'Authorization unavailable' if expected == 503 else 'Access denied'})
                        response.close()
                    if expected != 200:
                        records.assert_not_called()
                        audit.assert_not_called()
                        proxy.assert_not_called()

    def test_empty_list_is_success_and_revocation_is_immediate(self):
        self.login()
        with patch.object(app, '_network_records', return_value=[]), patch.object(app, '_network_audit') as audit:
            response = self.client.get(self.api)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, {'contacts': []})
            audit.assert_called_once_with('list', 'Contacts_Initiative')
            self.roles[0]['fields']['Permissions'] = '[]'
            audit.reset_mock()
            self.assertEqual(self.client.get(self.api).status_code, 403)
            audit.assert_not_called()

    def test_routes_read_only_and_legacy_admin_unchanged(self):
        rules = [r for r in app.app.url_map.iter_rules() if '/reseau' in r.rule]
        self.assertEqual(len(rules), 7)
        for rule in rules:
            self.assertFalse({'DELETE', 'PUT'} & rule.methods)
        self.login()
        with self.client.session_transaction() as session:
            personal = dict(session['admin_session:eures-beta'])
            personal.pop('Version_session')
            session['admin_session:eures-beta'] = personal
        with patch.object(app, 'eures_permission_http_response', side_effect=AssertionError('Unexpected Phase 2B check')):
            response = self.client.get('/admin/eures-beta/')
            self.assertEqual(response.status_code, 200)
            response.close()

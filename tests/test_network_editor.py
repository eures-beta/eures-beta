"""Fictional data only; all external transports blocked or mocked."""
import base64
import json
import unittest
from unittest.mock import Mock, patch

import app
from network_editor import TEXT, DATES, CHOICES
import test_network_module as network_tests


CHOICE_VALUES = {
    'Type_contact': ['Institutionnel', "Service public de l'emploi", 'Partenaire', 'Employeur',
                     'Expert', "Écosystème startup d'État", 'Presse / Communication', 'Autre'],
    'Source_contact': ['Réunion', 'Événement', 'Introduction', 'Contact direct', 'Formulaire', 'Autre'],
    'Newsletter_statut': ['Non sollicité', 'Accepté', 'Refusé', 'Désabonné'],
}


class EditorTest(unittest.TestCase):
    login = network_tests.NetworkTest.login
    def setUp(self):
        network_tests.NetworkTest.setUp(self)
        self.roles[0]['fields']['Permissions'] = '["reseau.read", "reseau.write"]'
        self.users.append({'fields': {'Utilisateur_ID': 'inactive', 'Email': 'inactive@example.org', 'Actif': False}})
        self.login()
        self.record['fields'].update(Proprietaire_contact='fictional-eric', Contact_ID='CI-existing', Actif=True)
        self.records = self.enterContext(patch.object(app, '_network_records', return_value=[self.record]))
        self.write = self.enterContext(patch.object(app, '_network_write'))
        self.choices = self.enterContext(patch.object(app, '_network_choices', return_value=CHOICE_VALUES))
        self.enterContext(patch.object(app.requests.sessions.Session, 'request', side_effect=AssertionError('External transport forbidden')))
        with self.client.session_transaction() as session:
            session['network_csrf'] = 'fictional-csrf'
        self.headers = {'X-Network-CSRF': 'fictional-csrf'}

    def post(self, payload, **kwargs):
        return self.client.post(self.api, json=payload, headers=self.headers, **kwargs)

    def edit(self, payload):
        return self.client.patch(self.api + '/7', json=payload, headers=self.headers)

    def test_create_defaults_and_audit(self):
        with self.assertLogs(app.app.logger, level='WARNING') as logs:
            result = self.post({'Nom': ' Fiction ', 'Email': 'private@example.org', 'Notes': 'private note'})
        self.assertEqual(result.status_code, 201)
        fields, record_id = self.write.call_args.args
        self.assertIsNone(record_id)
        self.assertRegex(fields['Contact_ID'], r'^CI-[a-f0-9-]{36}$')
        self.assertEqual(fields['Nom'], 'Fiction')
        self.assertIs(fields['Actif'], True)
        self.assertEqual(fields['Newsletter_statut'], 'Non sollicité')
        self.assertIsNone(fields['Date_consentement'])
        self.assertEqual(fields['Proprietaire_contact'], 'fictional-eric')
        event = json.loads(logs.records[-1].getMessage().split('network_audit ', 1)[1])
        self.assertEqual(event['action'], 'create')
        self.assertIn('timestamp', event)
        self.assertIn(fields['Contact_ID'], event['target'])
        self.assertEqual(event['user'], 'eric@example.org')
        for sensitive in ('private@example.org', 'private note', 'fictional-csrf'):
            self.assertNotIn(sensitive, str(logs.output))

    def test_invalid_payloads_never_write(self):
        for payload in [None, [], {'Nom': '  ', 'Prenom': '\t', 'Organisation': ''},
                {'Nom': 'Test', 'Contact_ID': 'client-id'}, {'Nom': 'Test', 'Actif': False},
                {'Nom': 'Test', 'Unknown': 'value'}, {'Nom': 4}, {'Nom': 'x'*201},
                {'Nom': 'Test', 'Type_contact': 'invention'}, {'Nom': 'Test', 'Source_contact': 'invention'},
                {'Nom': 'Test', 'Newsletter_statut': 'invention'},
                {'Nom': 'Test', 'Newsletter_statut': 'Accepté'},
                {'Nom': 'Test', 'Date_consentement': '2026-02-30'},
                {'Nom': 'Test', 'Date_premier_contact': 1780000000},
                {'Nom': 'Test', 'Derniere_interaction': 'yesterday'},
                {'Nom': 'Test', 'Email': 'no-at'}, {'Nom': 'Test', 'Telephone': 'abc'},
                {'Nom': 'Test', 'Proprietaire_contact': 'inactive'},
                {'Nom': 'Test', 'Proprietaire_contact': 'unknown'}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.post(payload).status_code, 400)
        self.write.assert_not_called()

    def test_accept_with_explicit_date_and_update_deactivate(self):
        self.assertEqual(self.post({'Organisation': 'Fiction', 'Newsletter_statut': 'Accepté',
            'Date_consentement': '2026-09-09'}).status_code, 201)
        self.assertIsInstance(self.write.call_args.args[0]['Date_consentement'], int)
        self.assertEqual(self.edit({'Actif': False, 'Notes': 'New fictional note'}).status_code, 200)
        fields, target = self.write.call_args.args
        self.assertEqual(target, 7)
        self.assertEqual(fields, {'Actif': False, 'Notes': 'New fictional note'})
        self.assertNotIn('Contact_ID', fields)
        self.assertEqual(self.edit({'Actif': 'false'}).status_code, 400)
        self.assertEqual(self.edit({'Contact_ID': 'changed'}).status_code, 400)

    def test_editor_active_owners_default_and_legacy_preservation(self):
        result = self.client.get(self.api.replace('contacts', 'editor'))
        self.assertEqual(result.status_code, 200)
        self.assertEqual({r['id'] for r in result.json['owners']}, {'fictional-eric', 'fictional-bob'})
        self.assertEqual(result.json['default_owner'], 'fictional-eric')
        self.assertEqual(result.json['csrf'], 'fictional-csrf')
        self.record['fields']['Proprietaire_contact'] = ' Ancien responsable '
        self.assertEqual(self.edit({'Nom': 'Changed', 'Proprietaire_contact': ' Ancien responsable '}).status_code, 200)
        self.assertNotIn('Proprietaire_contact', self.write.call_args.args[0])
        self.assertEqual(self.edit({'Proprietaire_contact': 'fictional-bob'}).status_code, 200)
        self.assertEqual(self.edit({'Proprietaire_contact': 'other legacy'}).status_code, 400)

    def test_mutation_authorization_matrix(self):
        for case in ('read_only', 'write_only', 'missing_version', 'wrong_version', 'inactive', 'unavailable', 'basic', 'fallback'):
            with self.subTest(case=case):
                self.login()
                self.roles[0]['fields']['Permissions'] = json.dumps(['reseau.read'] if case == 'read_only' else ['reseau.write'] if case == 'write_only' else ['reseau.read', 'reseau.write'])
                self.users[0]['fields']['Actif'] = case != 'inactive'
                with self.client.session_transaction() as session:
                    personal = dict(session['admin_session:eures-beta'])
                    if case == 'missing_version': personal.pop('Version_session')
                    if case == 'wrong_version': personal['Version_session'] = 2
                    if case == 'fallback': personal['email'] = 'admin'
                    session['admin_session:eures-beta'] = personal
                    if case == 'basic': session.pop('admin_session:eures-beta')
                def reader():
                    if case == 'unavailable': raise RuntimeError('secret upstream')
                    return self.users, self.roles
                with patch.object(app, '_eures_permission_reader', return_value=reader):
                    expected = 503 if case == 'unavailable' else 403
                    headers = {**self.headers, 'Authorization': 'Basic '+base64.b64encode(b'shared:password').decode()}
                    for method, url in [('post', self.api), ('patch', self.api+'/7'), ('get', self.api.replace('contacts', 'editor'))]:
                        self.assertEqual(getattr(self.client, method)(url, json={'Nom': 'Test'}, headers=headers).status_code, expected)
        self.write.assert_not_called()

    def test_csrf_and_json_required(self):
        for headers in ({}, {'X-Network-CSRF': 'wrong'}, {'X-Network-CSRF': 'é'}):
            for url, method in ((self.api, 'post'), (self.api+'/7', 'patch')):
                self.assertEqual(getattr(self.client, method)(url, json={'Nom': 'Fiction'}, headers=headers).status_code, 403)
        self.assertEqual(self.client.post(self.api, data='Nom=Fiction', headers=self.headers).status_code, 400)
        self.assertEqual(self.post({'Notes': 'x'*70000}).status_code, 413)
        self.write.assert_not_called()

    def test_collision_retry_and_exhaustion(self):
        with patch('uuid.uuid4', side_effect=['existing', 'new']):
            self.assertEqual(app._network_new_id(), 'CI-new')
        with patch('uuid.uuid4', return_value='existing'):
            with self.assertRaises(RuntimeError): app._network_new_id()
        with patch('uuid.uuid4', return_value='existing'):
            self.assertEqual(self.post({'Nom': 'Test'}).status_code, 503)
        self.write.assert_not_called()

    def test_missing_record_noop_and_upstream_failure(self):
        self.records.return_value = []
        self.assertEqual(self.edit({'Nom': 'Test'}).status_code, 404)
        self.records.return_value = [self.record]
        self.assertEqual(self.edit({}).status_code, 200)
        self.write.assert_not_called()
        self.write.side_effect = RuntimeError('sensitive upstream')
        with self.assertLogs(app.app.logger) as logs:
            result = self.post({'Nom': 'Test'})
        self.assertEqual(result.status_code, 503)
        self.assertNotIn('sensitive upstream', result.text + str(logs.output))
        self.assertNotIn('network_audit', str(logs.output))

    def test_can_write_false_for_reader(self):
        self.roles[0]['fields']['Permissions'] = '["reseau.read"]'
        result = self.client.get(self.api.replace('contacts', 'access'))
        self.assertFalse(result.json['can_write'])
        self.assertEqual(self.post({'Nom': 'Test'}).status_code, 403)

    def test_update_audit_contains_only_field_names(self):
        with self.assertLogs(app.app.logger, level='WARNING') as logs:
            self.assertEqual(self.edit({'Email': 'new-private@example.org', 'Notes': 'private update'}).status_code, 200)
        event = json.loads(logs.records[-1].getMessage().split('network_audit ', 1)[1])
        self.assertEqual(event['fields'], ['Email', 'Notes'])
        self.assertEqual(event['target'], 'Contacts_Initiative/CI-existing')
        self.assertNotEqual(event['target'], 'Contacts_Initiative/7')
        self.assertEqual(event['action'], 'update')
        self.assertNotIn('new-private', str(logs.output))
        self.assertNotIn('private update', str(logs.output))

    def test_owner_label_and_duplicate_catalogue(self):
        result = self.client.get(self.api + '/7')
        self.assertEqual(result.json['contact']['Proprietaire_contact_label'], 'eric@example.org')
        self.assertNotIn('owners', result.json)
        self.users.append(self.users[0])
        self.assertEqual(self.post({'Nom': 'Fiction'}).status_code, 403)
        self.write.assert_not_called()

    def test_csrf_issued_and_schema_unavailable(self):
        with self.client.session_transaction() as session:
            session.pop('network_csrf')
        result = self.client.get(self.api.replace('contacts', 'editor'))
        self.assertGreaterEqual(len(result.json['csrf']), 40)
        self.assertEqual(result.headers['Cache-Control'], 'no-store, private')
        self.headers['X-Network-CSRF'] = result.json['csrf']
        self.choices.side_effect = RuntimeError('incompatible schema')
        self.assertEqual(self.post({'Nom': 'Fiction'}).status_code, 503)
        self.write.assert_not_called()

    def test_edit_accept_requires_known_date_and_preserves_empty_owner(self):
        self.record['fields']['Date_consentement'] = ''
        self.assertEqual(self.edit({'Newsletter_statut': 'Accepté'}).status_code, 400)
        self.record['fields']['Proprietaire_contact'] = None
        self.assertEqual(self.edit({'Nom': 'Fiction'}).status_code, 200)
        self.assertNotIn('Proprietaire_contact', self.write.call_args.args[0])


class TransportTest(unittest.TestCase):
    def test_fixed_write_boundary_no_redirect_no_retry(self):
        with patch.object(app, 'get_form_config', return_value={'doc_id': 'dPYCS1LhDd8Q', 'api_key': 'fictional'}), patch.object(app.requests, 'post', return_value=Mock(status_code=200)) as post, patch.object(app.requests, 'patch', return_value=Mock(status_code=200)) as update:
            app._network_write({'Nom': 'Test', 'Contact_ID': 'CI-test'})
            app._network_write({'Actif': False}, 7)
            for call in (post.call_args, update.call_args):
                self.assertTrue(call.args[0].endswith('/api/docs/dPYCS1LhDd8Q/tables/Contacts_Initiative/records'))
                self.assertFalse(call.kwargs['allow_redirects'])
                self.assertEqual(call.kwargs['timeout'], 20)
            self.assertEqual(update.call_args.kwargs['json'], {'records': [{'id': 7, 'fields': {'Actif': False}}]})
            with self.assertRaises(ValueError): app._network_write({'Unknown': 'bad'})
            with self.assertRaises(ValueError): app._network_write({'Contact_ID': 'bad'}, 7)
        with patch.object(app, 'get_form_config', return_value={'doc_id': 'wrong', 'api_key': 'fictional'}):
            with self.assertRaises(RuntimeError): app._network_write({'Nom': 'Test'})

    def test_schema_read_and_fail_closed_without_migration(self):
        types = {**{k: 'Text' for k in TEXT}, **{k: 'Date' for k in DATES},
                 **{k: 'Choice' for k in CHOICES}, 'Contact_ID': 'Text', 'Actif': 'Bool'}
        columns = [{'id': k, 'fields': {'type': v, 'isFormula': False, 'formula': '',
                    'widgetOptions': json.dumps({'choices': CHOICE_VALUES[k]}) if k in CHOICES else '{}'}} for k,v in types.items()]
        with patch.object(app, 'get_form_config', return_value={'doc_id': 'dPYCS1LhDd8Q', 'api_key': 'fictional'}), patch.object(app.requests, 'get', return_value=Mock(status_code=200, json=lambda: {'columns': columns})) as get:
            self.assertEqual(app._network_choices(), CHOICE_VALUES)
            self.assertTrue(get.call_args.args[0].endswith('/Contacts_Initiative/columns'))
            self.assertFalse(get.call_args.kwargs['allow_redirects'])
            columns[0]['fields']['isFormula'] = True
            with self.assertRaises(RuntimeError): app._network_choices()


if __name__ == '__main__':
    unittest.main()

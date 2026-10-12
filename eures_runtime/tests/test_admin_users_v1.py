"""Fictional data only; every external transport is mocked."""
import base64
import json
import unittest
from unittest.mock import Mock, patch

import app
from eures_admin_users import (
    ConflictError, GristAdminDirectory, new_user_fields, plan_update, public_user, role_map,
)


ADMIN_EMAIL = 'admin@example.org'


class FakeDirectory:
    def __init__(self):
        self.roles = [
            {'id': 11, 'fields': {'Code': 'administrateur', 'Libelle': 'Administrateur',
                'Permissions': json.dumps(['admin.users', 'reseau.read', 'reseau.write'])}},
            {'id': 22, 'fields': {'Code': 'equipe_match_europe', 'Libelle': 'Équipe Match Europe',
                'Permissions': json.dumps(['candidats.read', 'reseau.read', 'reseau.write'])}},
        ]
        self.users = [{'id': 1, 'fields': {
            'Utilisateur_ID': 'usr_admin', 'Nom': 'Admin', 'Fonction': 'Pilotage',
            'Email': ADMIN_EMAIL, 'Telephone': '+331234', 'Institution': 'EURES',
            'Pays': 'France', 'Role': 11, 'Actif': True, 'Version_session': 1,
        }}]
        self.created = []
        self.updated = []

    def read(self):
        return self.users, self.roles

    def create_user(self, fields):
        record = {'id': 2, 'fields': dict(fields)}
        self.users.append(record)
        self.created.append(fields)
        return record

    def update_user(self, record_id, fields):
        record = next(row for row in self.users if row['id'] == record_id)
        record['fields'].update(fields)
        self.updated.append((record_id, fields))


class AdminUsersRouteTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(app.os.environ, {
            'ADMIN_AUTH_MODE_EURES_BETA': 'hybrid',
            'ADMIN_ALLOWED_EMAILS_EURES_BETA': ADMIN_EMAIL,
            'ADMIN_USERNAME_EURES_BETA': 'shared', 'ADMIN_PASSWORD_EURES_BETA': 'password',
        })
        self.env.start(); self.addCleanup(self.env.stop)
        self.proxy = self.enterContext(patch.object(app, 'maybe_proxy_eures_request', return_value=None))
        self.directory = FakeDirectory()
        self.enterContext(patch.object(app, '_admin_users_directory', return_value=self.directory))
        self.enterContext(patch.object(app, '_eures_permission_reader',
            return_value=lambda: (self.directory.users, self.directory.roles)))
        self.enterContext(patch.object(app.requests.sessions.Session, 'request',
            side_effect=AssertionError('External transport forbidden')))
        self.client = app.app.test_client()
        self.base = '/api/forms/eures-beta/admin/utilisateurs'

    def login(self, version=1):
        with self.client.session_transaction() as flask_session:
            flask_session['admin_session:eures-beta'] = {
                'email': ADMIN_EMAIL, 'authenticated_at': app._now_iso_utc(),
                'Version_session': version,
            }

    def csrf(self):
        response = self.client.get(self.base + '/access')
        self.assertEqual(response.status_code, 200)
        return response.json['csrf_token']

    def test_numeric_ref_authorizes_lists_and_resolves_to_code(self):
        self.login()
        response = self.client.get(self.base)
        self.assertEqual(response.status_code, 200)
        self.proxy.assert_not_called()
        self.assertEqual(response.json['users'][0]['Role'], 'administrateur')
        self.assertEqual(response.headers['Cache-Control'], 'no-store, private')
        detail = self.client.get(self.base + '/1')
        self.assertEqual(detail.json['user']['Role'], 'administrateur')
        page = self.client.get('/admin/eures-beta/utilisateurs')
        self.assertEqual(page.status_code, 200)
        self.assertIn('Utilisateurs &amp; droits', page.text)
        page.close()

    def test_basic_refused_permission_stale_session_and_unavailable(self):
        basic = base64.b64encode(b'shared:password').decode()
        self.assertEqual(self.client.get(self.base, headers={'Authorization': 'Basic ' + basic}).status_code, 401)
        self.login()
        self.directory.roles[0]['fields']['Permissions'] = '[]'
        self.assertEqual(self.client.get(self.base).status_code, 403)
        self.directory.roles[0]['fields']['Permissions'] = '["admin.users"]'
        self.directory.users[0]['fields']['Version_session'] = 2
        self.assertEqual(self.client.get(self.base).status_code, 403)
        with patch.object(app, '_eures_permission_reader',
                return_value=lambda: (_ for _ in ()).throw(RuntimeError('private'))):
            self.assertEqual(self.client.get(self.base).status_code, 503)

    def test_create_writes_selected_grist_reference_and_server_fields(self):
        self.login(); token = self.csrf()
        payload = {'Nom': 'Nouveau', 'Fonction': 'Conseiller', 'Email': 'NEW@example.org',
            'Telephone': '00351 001 234', 'Institution': 'Partenaire', 'Pays': 'Portugal',
            'Role': 'equipe_match_europe', 'Actif': False}
        with self.assertLogs(app.app.logger, level='WARNING') as logs:
            response = self.client.post(self.base, json=payload, headers={'X-CSRF-Token': token})
        self.assertEqual(response.status_code, 201)
        fields = self.directory.created[0]
        self.assertEqual(fields['Role'], 22)
        self.assertIs(fields['Actif'], True)
        self.assertEqual(fields['Version_session'], 1)
        self.assertTrue(fields['Utilisateur_ID'].startswith('usr_'))
        self.assertEqual(fields['Telephone'], '00351 001 234')
        audit = next(line for line in logs.output if 'admin_users_audit' in line)
        self.assertNotIn('00351', audit)
        self.assertNotIn('new@example.org', audit)

    def test_change_admin_team_and_back_writes_refs_and_increments(self):
        self.login(); token = self.csrf()
        self.directory.users.append({'id': 2, 'fields': {
            'Utilisateur_ID': 'usr_other', 'Nom': 'Other', 'Email': 'other@example.org',
            'Role': 11, 'Actif': True, 'Version_session': 4,
        }})
        response = self.client.patch(self.base + '/2', json={
            'expected_version': 4, 'Role': 'equipe_match_europe',
        }, headers={'X-CSRF-Token': token})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.directory.updated[-1][1], {'Role': 22, 'Version_session': 5})
        response = self.client.patch(self.base + '/2', json={
            'expected_version': 5, 'Role': 'administrateur',
        }, headers={'X-CSRF-Token': token})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.directory.updated[-1][1], {'Role': 11, 'Version_session': 6})

    def test_legacy_text_admin_read_compatibility_without_silent_rewrite(self):
        self.directory.users[0]['fields']['Role'] = 'administrateur'
        self.login(); token = self.csrf()
        self.assertEqual(self.client.get(self.base).json['users'][0]['Role'], 'administrateur')
        response = self.client.patch(self.base + '/1', json={
            'expected_version': 1, 'Role': 'administrateur', 'Pays': 'Portugal',
        }, headers={'X-CSRF-Token': token})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.directory.updated[-1][1], {'Pays': 'Portugal'})

    def test_csrf_stale_record_self_and_last_admin_guards(self):
        self.login()
        self.assertEqual(self.client.patch(self.base + '/1', json={
            'expected_version': 1, 'Pays': 'Portugal'}).status_code, 403)
        token = self.csrf()
        response = self.client.patch(self.base + '/1', json={
            'expected_version': 99, 'Pays': 'Portugal'}, headers={'X-CSRF-Token': token})
        self.assertEqual((response.status_code, response.json['error']), (409, 'stale_record'))
        response = self.client.patch(self.base + '/1', json={
            'expected_version': 1, 'Actif': False}, headers={'X-CSRF-Token': token})
        self.assertEqual((response.status_code, response.json['error']),
                         (409, 'self_deactivation_forbidden'))
        with self.assertRaises(ConflictError) as blocked:
            plan_update({'expected_version': 1, 'Actif': False}, self.directory.users,
                        self.directory.roles, 1, 'different_actor')
        self.assertEqual(str(blocked.exception), 'last_active_admin')

    def test_status_changes_increment_and_contact_update_does_not(self):
        self.login(); token = self.csrf()
        self.directory.users.append({'id': 2, 'fields': {
            'Utilisateur_ID': 'usr_other', 'Nom': 'Other', 'Email': 'other@example.org',
            'Role': 22, 'Actif': True, 'Version_session': 4,
        }})
        response = self.client.patch(self.base + '/2', json={
            'expected_version': 4, 'Telephone': '+0033 00'}, headers={'X-CSRF-Token': token})
        self.assertEqual(response.json['user']['Version_session'], 4)
        self.assertNotIn('Version_session', self.directory.updated[-1][1])
        response = self.client.patch(self.base + '/2', json={
            'expected_version': 4, 'Actif': False}, headers={'X-CSRF-Token': token})
        self.assertEqual(response.json['user']['Version_session'], 5)
        response = self.client.patch(self.base + '/2', json={
            'expected_version': 5, 'Actif': True}, headers={'X-CSRF-Token': token})
        self.assertEqual(response.json['user']['Version_session'], 6)

    def test_no_delete_server_fields_and_roles_read_only(self):
        self.login(); token = self.csrf()
        self.assertEqual(self.client.delete(self.base + '/1').status_code, 405)
        response = self.client.post(self.base, json={'Nom': 'X', 'Email': 'x@example.org',
            'Role': 'equipe_match_europe', 'Utilisateur_ID': 'chosen', 'Version_session': 99},
            headers={'X-CSRF-Token': token})
        self.assertEqual(response.status_code, 400)
        roles = self.client.get('/api/forms/eures-beta/admin/roles')
        self.assertEqual(roles.status_code, 200)
        self.assertEqual(roles.json['roles'][1]['record_id'], 22)
        for method in ('post', 'patch', 'put', 'delete'):
            self.assertEqual(getattr(self.client, method)(
                '/api/forms/eures-beta/admin/roles', json={}).status_code, 405)


class AdminUsersDomainTest(unittest.TestCase):
    def test_public_user_resolves_numeric_and_legacy_roles(self):
        directory = FakeDirectory(); roles = role_map(directory.roles)
        self.assertEqual(public_user(directory.users[0], roles)['Role'], 'administrateur')
        directory.users[0]['fields']['Role'] = 'administrateur'
        self.assertEqual(public_user(directory.users[0], roles)['Role'], 'administrateur')

    def test_creation_domain_writes_ref_not_code(self):
        directory = FakeDirectory()
        fields = new_user_fields({'Nom': 'X', 'Email': 'x@example.org',
            'Role': 'equipe_match_europe'}, directory.users, directory.roles)
        self.assertEqual(fields['Role'], 22)
        self.assertNotEqual(fields['Role'], 'equipe_match_europe')

    def test_transport_fixed_tables_and_create_response_with_id_only(self):
        get = Mock(side_effect=[Mock(status_code=200, json=lambda: {'records': []}),
                                Mock(status_code=200, json=lambda: {'records': []})])
        post = Mock(return_value=Mock(status_code=200, json=lambda: {'records': [{'id': 9}]}))
        directory = GristAdminDirectory(lambda: {'api_key': 'token'},
            lambda: 'https://grist.numerique.gouv.fr', get=get, post=post)
        self.assertEqual(directory.read(), ([], []))
        created = directory.create_user({'Role': 22, 'Nom': 'X'})
        self.assertEqual(created, {'id': 9, 'fields': {'Role': 22, 'Nom': 'X'}})
        self.assertEqual(post.call_args.kwargs['json']['records'][0]['fields']['Role'], 22)
        self.assertTrue(all(call.kwargs['allow_redirects'] is False
                            for call in get.call_args_list + [post.call_args]))


if __name__ == '__main__':
    unittest.main()

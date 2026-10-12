import base64
import copy
import json
import unittest
from unittest.mock import Mock, patch

import app
import eures_permissions as p


class PermissionEngineTest(unittest.TestCase):
    def setUp(self):
        self.session = {'email': ' Alice@Example.org ', 'Version_session': 1}
        self.users = [{'fields': {'Utilisateur_ID': 'user_test', 'Email': 'alice@example.org',
                                 'Actif': True, 'Role': 'reader', 'Version_session': 1}}]
        self.roles = [{'fields': {'Code': 'reader', 'Permissions': '["reseau.read"]'}}]
        self.reader = Mock(side_effect=lambda: (self.users, self.roles))

    def result(self):
        return p.resolve_authorization(self.session, self.reader)

    def test_valid_normalized_user_explicit_permissions(self):
        self.assertTrue(self.result().has_permission('reseau.read'))
        self.assertFalse(self.result().has_permission('admin.users'))
        self.assertTrue(p.has_permission('reseau.read', self.session, self.reader))
        self.assertEqual(p.require_permission('reseau.read', self.session, self.reader).user_id, 'user_test')

    def test_numeric_grist_role_reference_resolves_to_code(self):
        self.users[0]['fields']['Role'] = 27
        self.roles[0]['id'] = 27
        result = self.result()
        self.assertEqual(result.reason, 'authorized')
        self.assertEqual(result.role_code, 'reader')
        self.assertTrue(result.has_permission('reseau.read'))

    def test_unknown_or_boolean_role_reference_fails_closed(self):
        self.roles[0]['id'] = 27
        for value, reason in ((99, 'role_absent'), (True, 'role_invalid'), (0, 'role_invalid')):
            self.users[0]['fields']['Role'] = value
            self.assertEqual(self.result().reason, reason)

    def test_absent_user(self):
        self.users.clear()
        self.assertEqual(self.result().reason, 'user_absent')

    def test_inactive_strict_boolean(self):
        for value in (False, 'true', 1, None):
            self.users[0]['fields']['Actif'] = value
            self.assertEqual(self.result().reason, 'user_inactive')

    def test_duplicate_email_including_inactive(self):
        other = copy.deepcopy(self.users[0])
        other['fields'].update(Email=' ALICE@example.org ', Actif=False)
        self.users.append(other)
        self.assertEqual(self.result().reason, 'user_duplicate')

    def test_role_absent(self):
        self.roles.clear()
        self.assertEqual(self.result().reason, 'role_absent')

    def test_role_duplicate(self):
        self.roles.append(copy.deepcopy(self.roles[0]))
        self.assertEqual(self.result().reason, 'role_duplicate')

    def test_role_must_be_single_code(self):
        for value in (None, '', ['reader']):
            self.users[0]['fields']['Role'] = value
            self.assertEqual(self.result().reason, 'role_invalid')

    def test_unknown_permission_invalidates_whole_role(self):
        self.roles[0]['fields']['Permissions'] = '["reseau.read","reseau.unknown"]'
        self.assertEqual(self.result().reason, 'permission_unknown')
        self.assertFalse(self.result().has_permission('reseau.read'))

    def test_wildcards_forbidden(self):
        for value in ('*', 'reseau.*'):
            self.roles[0]['fields']['Permissions'] = json.dumps(['reseau.read', value])
            self.assertEqual(self.result().reason, 'wildcard_forbidden')

    def test_bad_permissions_fail_closed(self):
        for value in ('bad json', '{}', 'null', '[1]', None, ['reseau.read']):
            self.roles[0]['fields']['Permissions'] = value
            self.assertEqual(self.result().reason, 'permissions_invalid')

    def test_empty_permissions_grant_nothing(self):
        self.roles[0]['fields']['Permissions'] = '[]'
        self.assertFalse(self.result().has_permission('reseau.read'))

    def test_session_version_missing_wrong_or_bad_type(self):
        for value in (None, 0, 2, True, '1', 1.0):
            self.session['Version_session'] = value
            self.assertEqual(self.result().reason, 'session_version_invalid')

    def test_grist_version_strict(self):
        for value in (None, True, '1', 2, 1.0):
            self.users[0]['fields']['Version_session'] = value
            self.assertEqual(self.result().reason, 'session_version_invalid')

    def test_unavailable_and_malformed_grist(self):
        self.reader.side_effect = RuntimeError('private upstream body')
        self.assertEqual(self.result(), p.Authorization('grist_unavailable'))
        self.reader.side_effect = lambda: ([{}], [])
        self.assertEqual(self.result().reason, 'grist_unavailable')

    def test_no_session_does_not_read(self):
        self.session = None
        self.assertEqual(self.result().reason, 'personal_session_required')
        self.reader.assert_not_called()

    def test_recovery_address_is_not_an_alias(self):
        self.session['email'] = 'recovery@example.org'
        self.assertEqual(self.result().reason, 'user_absent')

    def test_user_id_must_be_unique(self):
        other = copy.deepcopy(self.users[0])
        other['fields']['Email'] = 'other@example.org'
        self.users.append(other)
        self.assertEqual(self.result().reason, 'user_id_duplicate')

    def test_no_cache_revocation_visible_immediately(self):
        self.assertTrue(p.has_permission('reseau.read', self.session, self.reader))
        self.users[0]['fields']['Actif'] = False
        self.assertFalse(p.has_permission('reseau.read', self.session, self.reader))
        self.assertEqual(self.reader.call_count, 2)

    def test_require_permission_denies_and_unknown_requests(self):
        for permission in ('admin.users', '*', 'new.permission', None, []):
            with self.assertRaises(p.PermissionDenied):
                p.require_permission(permission, self.session, self.reader)
            self.assertFalse(p.has_permission(permission, self.session, self.reader))


class GristReaderTest(unittest.TestCase):
    def test_fixed_document_get_only_no_redirect_no_cache(self):
        get = Mock(return_value=Mock(status_code=200, json=lambda: {'records': []}))
        config = Mock(return_value={'api_key': 'fictional-test-key', 'doc_id': 'business'})
        reader = p.GristAuthorizationReader(config, lambda: p.GRIST_SERVER, get=get)
        self.assertEqual(reader(), ([], []))
        reader()
        self.assertEqual(config.call_count, 2)
        self.assertEqual(get.call_count, 4)
        for call in get.call_args_list:
            self.assertTrue(call.args[0].startswith(p.GRIST_SERVER + '/api/docs/a9T1veaFas9u/tables/'))
            self.assertFalse(call.kwargs['allow_redirects'])
            self.assertEqual(call.kwargs['timeout'], 10)

    def test_transport_errors_are_sanitized(self):
        for status in (301, 401, 403, 404, 500):
            get = Mock(return_value=Mock(status_code=status))
            reader = p.GristAuthorizationReader(lambda: {'api_key': 'fake'}, lambda: p.GRIST_SERVER, get)
            with self.assertRaisesRegex(p.GristUnavailable, '^grist_unavailable$'):
                reader()
            self.assertEqual(get.call_count, 1)

    def test_configuration_denied_without_network(self):
        get = Mock()
        for config, url in ((None, p.GRIST_SERVER), ({}, p.GRIST_SERVER), ({'api_key': 'fake'}, 'https://other.example')):
            with self.assertRaises(p.GristUnavailable):
                p.GristAuthorizationReader(lambda: config, lambda: url, get)()
        get.assert_not_called()


class ApplicationPhaseOneTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(app.os.environ, {
            'ADMIN_AUTH_MODE_EURES_BETA': 'hybrid',
            'ADMIN_ALLOWED_EMAILS_EURES_BETA': 'alice@example.org',
            'ADMIN_USERNAME_EURES_BETA': 'shared', 'ADMIN_PASSWORD_EURES_BETA': 'fictional',
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = app.app.test_client()

    def test_adapter_uses_validated_personal_session(self):
        with app.app.test_request_context('/'):
            app.session['admin_session:eures-beta'] = {
                'email': 'alice@example.org', 'authenticated_at': app._now_iso_utc(), 'Version_session': 1,
            }
            with patch.object(app, '_eures_permission_reader', return_value=lambda: (
                [{'fields': {'Utilisateur_ID': 'test', 'Email': 'alice@example.org', 'Role': 'reader', 'Actif': True, 'Version_session': 1}}],
                [{'fields': {'Code': 'reader', 'Permissions': '["reseau.read"]'}}],
            )):
                self.assertTrue(app.has_permission('reseau.read'))
                self.assertEqual(app.require_permission('reseau.read').user_id, 'test')
                app.session['admin_session:eures-beta']['Version_session'] = 2
                self.assertFalse(app.has_permission('reseau.read'))

    def test_legacy_session_missing_version_logically_denied(self):
        with app.app.test_request_context('/'):
            app._set_admin_session('eures-beta', 'alice@example.org')
            self.assertEqual(app.get_eures_authorization().reason, 'session_version_invalid')

    def test_current_basic_and_personal_access_do_not_call_new_engine(self):
        with patch.object(app, 'maybe_proxy_eures_request', return_value=None), patch.object(
            p.GristAuthorizationReader, '__call__', side_effect=RuntimeError('unavailable')
        ) as reader, patch.object(app, 'get_eures_authorization', side_effect=AssertionError('unexpected enforcement')):
            basic = base64.b64encode(b'shared:fictional').decode()
            response = self.client.get('/admin/eures-beta/', headers={'Authorization': 'Basic ' + basic})
            self.assertEqual(response.status_code, 200)
            response.close()
            with self.client.session_transaction() as session:
                session['admin_session:eures-beta'] = {'email': 'alice@example.org', 'authenticated_at': app._now_iso_utc()}
            response = self.client.get('/admin/eures-beta/')
            self.assertEqual(response.status_code, 200)
            response.close()
            reader.assert_not_called()


if __name__ == '__main__':
    unittest.main()

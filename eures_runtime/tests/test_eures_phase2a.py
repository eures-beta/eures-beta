import copy
import json
import unittest
import uuid
from unittest.mock import patch
import app
import eures_permissions as p

EMAIL = "admin@example.test"

class Phase2ATest(unittest.TestCase):
    def setUp(self):
        self.users = [{"fields": {"Utilisateur_ID": "usr_eric_barthelemy", "Email": EMAIL,
            "Actif": True, "Role": "administrateur", "Version_session": 1}}]
        self.roles = [{"fields": {"Code": "administrateur", "Nom": "Administrateur",
            "Permissions": json.dumps([
                "candidats.read", "candidats.write", "candidats.delete", "candidats.cv.read",
                "employeurs.read", "employeurs.write", "employeurs.delete",
                "matchings.read", "matchings.write", "invitations.read", "invitations.write",
                "communications.send", "communications.test", "suivi.read", "suivi.write",
                "documentation.read", "documentation.write", "reseau.read",
                "statistiques.read", "systeme.read", "audit.read", "admin.users"])}}]
        self.reader = lambda: (self.users, self.roles)
        env = patch.dict(app.os.environ, {"ADMIN_AUTH_MODE_EURES_BETA": "hybrid",
            "ADMIN_ALLOWED_EMAILS_EURES_BETA": EMAIL,
            "SESSION_SECRET": "fictional-phase2a-secret"})
        env.start(); self.addCleanup(env.stop)
        self.client = app.app.test_client()

    def login(self, **extra):
        token = app.get_admin_magic_link_serializer("eures-beta").dumps(dict(
            email=EMAIL, form_id="eures-beta", jti=uuid.uuid4().hex, **extra))
        with patch.object(app, "maybe_proxy_eures_request", return_value=None), patch.object(
            app, "_eures_permission_reader", return_value=self.reader):
            return self.client.get("/admin/eures-beta/magic-login", query_string={"token": token, "Version_session": "888"})

    def test_real_signed_callback_issues_server_version_and_22_permissions(self):
        self.assertEqual(self.login(Version_session=999).status_code, 302)
        with self.client.session_transaction() as session:
            personal = dict(session["admin_session:eures-beta"])
        self.assertEqual(personal["Version_session"], 1)
        result = p.resolve_authorization(personal, self.reader)
        self.assertEqual(result.role_code, "administrateur")
        self.assertEqual(result.permissions, p.KNOWN_PERMISSIONS - {'reseau.write'})
        self.assertFalse(result.has_permission('reseau.write'))
        self.assertEqual(len(result.permissions), 22)
        self.users[0]["fields"]["Version_session"] = 2
        self.assertEqual(p.resolve_authorization(personal, self.reader).reason, "session_version_invalid")
        self.users[0]["fields"]["Actif"] = False
        self.assertEqual(p.resolve_authorization(personal, self.reader).reason, "user_inactive")

    def test_invalid_sources_never_issue_and_preserve_legacy_access(self):
        original = copy.deepcopy(self.users)
        for change in ({"Actif": False}, {"Role": "absent"}, {"Version_session": True}, {"Utilisateur_ID": ""}):
            self.users = copy.deepcopy(original)
            self.users[0]["fields"].update(change)
            self.assertEqual(self.login().status_code, 302)
            with self.client.session_transaction() as session:
                self.assertNotIn("Version_session", session["admin_session:eures-beta"])
            with patch.object(app, "maybe_proxy_eures_request", return_value=None):
                response = self.client.get("/admin/eures-beta/")
                self.assertEqual(response.status_code, 200)
                response.close()
        self.reader = lambda: (_ for _ in ()).throw(p.GristUnavailable())
        self.assertEqual(self.login().status_code, 302)
        with self.client.session_transaction() as session:
            self.assertNotIn("Version_session", session["admin_session:eures-beta"])

    def test_duplicate_and_recovery_do_not_issue(self):
        self.assertIsNone(p.issue_session_version("candidate@example.test", self.reader))
        self.users.append(copy.deepcopy(self.users[0]))
        self.assertIsNone(p.issue_session_version(EMAIL, self.reader))

    def test_invalid_signature_never_reads(self):
        with patch.object(app, "maybe_proxy_eures_request", return_value=None), patch.object(app, "_eures_permission_reader") as reader:
            self.assertEqual(self.client.get("/admin/eures-beta/magic-login?token=invalid").status_code, 400)
            reader.assert_not_called()

    def test_http_adapter_generic_denials_and_unavailable(self):
        with app.app.test_request_context("/"):
            app._set_admin_session("eures-beta", EMAIL)
            with patch.object(app, "_eures_permission_reader", return_value=self.reader):
                response, status = app.eures_permission_http_response("reseau.read")
                self.assertEqual(status, 403)
                self.assertEqual(response.get_json(), {"error": "Access denied"})
                app.session["admin_session:eures-beta"]["Version_session"] = 1
                self.assertIsNone(app.eures_permission_http_response("reseau.read"))
                self.roles[0]["fields"]["Permissions"] = "[]"
                self.assertEqual(app.eures_permission_http_response("reseau.read")[1], 403)
                self.users[0]["fields"]["Actif"] = False
                self.assertEqual(app.eures_permission_http_response("reseau.read")[0].get_json(), {"error": "Access denied"})
            with patch.object(app, "_eures_permission_reader", return_value=lambda: (_ for _ in ()).throw(RuntimeError("private"))):
                response, status = app.eures_permission_http_response("reseau.read")
                self.assertEqual(status, 503)
                self.assertEqual(response.get_json(), {"error": "Authorization unavailable"})

    def test_replay_never_reissues_version(self):
        token = app.get_admin_magic_link_serializer("eures-beta").dumps({
            "email": EMAIL, "form_id": "eures-beta", "jti": uuid.uuid4().hex})
        with patch.object(app, "maybe_proxy_eures_request", return_value=None), patch.object(
            app, "_eures_permission_reader", return_value=self.reader) as reader:
            self.assertEqual(self.client.get("/admin/eures-beta/magic-login", query_string={"token": token}).status_code, 302)
            reader.reset_mock()
            self.assertEqual(self.client.get("/admin/eures-beta/magic-login", query_string={"token": token}).status_code, 400)
            reader.assert_not_called()

    def test_legacy_session_is_never_upgraded_by_authorization(self):
        with app.app.test_request_context("/"):
            app._set_admin_session("eures-beta", EMAIL)
            with patch.object(app, "_eures_permission_reader", return_value=self.reader):
                self.assertEqual(app.get_eures_authorization().reason, "session_version_invalid")
                self.assertNotIn("Version_session", app.session["admin_session:eures-beta"])

    def test_login_success_and_failures_emit_no_temporary_log(self):
        original = copy.deepcopy(self.users)
        cases = [
            ({}, 'authorization=authorized version=1 permissions_count=22'),
            ({'Actif': False}, 'authorization=failed reason=invalid_authorization'),
            ({'Role': 'private-role'}, 'authorization=failed reason=invalid_authorization'),
            ({'Version_session': None}, 'authorization=failed reason=version_invalid'),
            ({'Version_session': True}, 'authorization=failed reason=version_invalid'),
            ({'Version_session': 'private-token'}, 'authorization=failed reason=version_invalid'),
            ({'Version_session': 0}, 'authorization=failed reason=version_invalid'),
            ('unavailable', 'authorization=failed reason=source_unavailable'),
            ('malformed', 'authorization=failed reason=source_unavailable'),
            ('duplicate', 'authorization=failed reason=invalid_authorization'),
            ('absent', 'authorization=failed reason=invalid_authorization'),
        ]
        for change, expected in cases:
            with self.subTest(change=change):
                self.users = copy.deepcopy(original)
                if isinstance(change, dict):
                    self.users[0]['fields'].update(change)
                elif change == 'duplicate':
                    self.users.append(copy.deepcopy(self.users[0]))
                elif change == 'absent':
                    self.users = []
                reader = lambda: (self.users, self.roles)
                if change == 'unavailable':
                    reader = lambda: (_ for _ in ()).throw(RuntimeError(
                        EMAIL + ' private-token private-cookie private-secret https://example.test/?token=private-token'))
                elif change == 'malformed':
                    reader = lambda: ('private-secret', self.roles)
                from unittest.mock import Mock
                self.reader = Mock(side_effect=reader)
                with self.assertNoLogs(app.app.logger, level='INFO'):
                    response = self.login(token_marker='private-token', cookie_marker='private-cookie')
                self.assertEqual(response.status_code, 302)
                self.reader.assert_called_once_with()
                with self.client.session_transaction() as session:
                    personal = session['admin_session:eures-beta']
                    if expected.startswith('authorization=authorized'):
                        self.assertEqual(personal['Version_session'], 1)
                    else:
                        self.assertNotIn('Version_session', personal)

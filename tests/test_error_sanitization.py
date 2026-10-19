import ast
import unittest
from unittest.mock import patch
import app


class ErrorSanitizationTest(unittest.TestCase):
    def test_public_token_and_admin_errors_hide_internal_detail_and_logs(self):
        client = app.app.test_client()
        secret = 'fictional-secret-upstream-payload'
        with patch.object(app, 'maybe_proxy_eures_request', return_value=None), patch.object(app, '_issue_eures_public_write_token', side_effect=RuntimeError(secret)):
            response = client.get('/api/forms/eures-beta/write-token?role=candidate')
            self.assertEqual(response.status_code, 500)
            self.assertNotIn(secret, response.get_data(as_text=True))
        with patch.dict(app.os.environ, {'ADMIN_AUTH_MODE_EURES_BETA': 'basic', 'ADMIN_USERNAME_EURES_BETA': 'fictional', 'ADMIN_PASSWORD_EURES_BETA': 'fictional-secret'}), patch.object(app, 'maybe_proxy_eures_request', return_value=None), patch.object(app, 'build_eures_admin_employers', side_effect=RuntimeError(secret)):
            import base64
            token = base64.b64encode(b'fictional:fictional-secret').decode()
            with self.assertLogs(app.app.logger, level='ERROR') as logs:
                response = client.get('/api/forms/eures-beta/admin/employers', headers={'Authorization': 'Basic ' + token})
            self.assertEqual(response.status_code, 500)
            self.assertNotIn(secret, response.get_data(as_text=True))
            self.assertNotIn(secret, str(logs.output))

    def test_error_messages_have_all_three_languages(self):
        for language, text in [('fr', 'Service temporairement'), ('en', 'Service temporarily'), ('de', 'Dienst vorübergehend')]:
            with app.app.test_request_context(headers={'Accept-Language': language}):
                response, status = app._client_error('fictional-sensitive-detail', 502)
                self.assertEqual(status, 502)
                self.assertIn(text, response.json['error'])
                self.assertNotIn('fictional-sensitive-detail', response.json['error'])

    def test_exception_responses_do_not_interpolate_details_on_server_errors(self):
        source = (app.BASE_DIR / 'app.py').read_text()
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.Return):
                text = ast.get_source_segment(source, node) or ''
                if ', 500' in text or 'status=500' in text:
                    self.assertNotRegex(text, r'str\((e|exc)\)|\{(e|exc)\}')

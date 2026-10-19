import re
import unittest
from pathlib import Path
from unittest.mock import patch
import app


class SecurityHeadersTest(unittest.TestCase):
    def test_admin_scripts_are_external_and_available_under_csp(self):
        pages = list((app.FORMS_DIR / 'eures-beta').glob('*.html')) + list((app.BASE_DIR / 'templates').glob('*.html'))
        client = app.app.test_client()
        with patch.object(app, 'maybe_proxy_eures_request', return_value=None):
            for page in pages:
                html = page.read_text()
                self.assertNotRegex(html, r'<script\s*>')
                for src in re.findall(r'<script[^>]+src="([^"]+)"', html):
                    if src.startswith('/assets/admin/'):
                        response = client.get(src)
                        self.assertEqual(response.status_code, 200, src)
                        self.assertIn("script-src 'self'", response.headers['Content-Security-Policy'])
                        self.assertNotIn("script-src 'unsafe-inline'", response.headers['Content-Security-Policy'])
                        response.close()

    def test_hsts_requires_explicit_setting_and_https(self):
        client = app.app.test_client()
        with patch.dict(app.os.environ, {'SECURITY_HSTS_MAX_AGE': '600'}):
            self.assertNotIn('Strict-Transport-Security', client.get('/missing').headers)
            response = client.get('/missing', base_url='https://example.test')
            self.assertEqual(response.headers['Strict-Transport-Security'], 'max-age=600')
            self.assertNotIn('includeSubDomains', response.headers['Strict-Transport-Security'])
        with patch.dict(app.os.environ, {'SECURITY_HSTS_MAX_AGE': '0'}):
            self.assertNotIn('Strict-Transport-Security', client.get('/missing', base_url='https://example.test').headers)

    def test_headers_also_cover_errors(self):
        response = app.app.test_client().get('/missing')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.headers['X-Frame-Options'], 'DENY')
        self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')

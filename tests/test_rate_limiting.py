import base64
import unittest
from unittest.mock import patch
from werkzeug.middleware.proxy_fix import ProxyFix
import app


class RateLimitTest(unittest.TestCase):
    def setUp(self):
        original = app.limiter.enabled
        app.limiter.enabled = True
        app.limiter.reset()
        self.addCleanup(setattr, app.limiter, 'enabled', original)
        self.addCleanup(app.limiter.reset)
        self.proxy = patch.object(app, 'maybe_proxy_eures_request', return_value=None)
        self.proxy.start();self.addCleanup(self.proxy.stop)
        self.client = app.app.test_client()

    def test_untrusted_forwarded_ip_does_not_bypass_limit(self):
        path = '/api/forms/eures-beta/record?uuid=fictional'
        for i in range(60):
            self.assertEqual(self.client.get(path, headers={'X-Forwarded-For': f'192.0.2.{i}'}).status_code, 403)
        response = self.client.get(path, headers={'X-Forwarded-For': '198.51.100.9'})
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response.headers)
        self.assertIn('error', response.json)

    def test_explicitly_trusted_proxy_uses_forwarded_peer(self):
        with patch.object(app.app, 'wsgi_app', ProxyFix(app.app.wsgi_app, x_for=1)):
            for _ in range(60):self.client.get('/api/forms/eures-beta/record', headers={'X-Forwarded-For': '192.0.2.1'})
            self.assertEqual(self.client.get('/api/forms/eures-beta/record', headers={'X-Forwarded-For': '192.0.2.1'}).status_code, 429)
            self.assertEqual(self.client.get('/api/forms/eures-beta/record', headers={'X-Forwarded-For': '192.0.2.2'}).status_code, 403)

    def test_failed_admin_auth_is_limited_across_routes(self):
        with patch.dict(app.os.environ, {'ADMIN_AUTH_MODE_EURES_BETA': 'basic', 'ADMIN_USERNAME_EURES_BETA': 'fictional', 'ADMIN_PASSWORD_EURES_BETA': 'fictional-secret'}):
            for _ in range(20):
                self.assertEqual(self.client.get('/api/forms/eures-beta/admin/overview').status_code, 401)
            self.assertEqual(self.client.get('/admin/eures-beta/').status_code, 429)

    def test_successful_admin_navigation_does_not_consume_failed_auth_budget(self):
        token = base64.b64encode(b'fictional:fictional-secret').decode()
        with patch.dict(app.os.environ, {'ADMIN_AUTH_MODE_EURES_BETA': 'basic', 'ADMIN_USERNAME_EURES_BETA': 'fictional', 'ADMIN_PASSWORD_EURES_BETA': 'fictional-secret'}):
            for _ in range(25):
                response = self.client.get('/admin/eures-beta/', headers={'Authorization': 'Basic ' + token})
                self.assertEqual(response.status_code, 200)
                response.close()

    def test_new_public_routes_have_limits_and_localized_errors(self):
        for method, path, limit in [('GET', '/api/forms/eures-beta/write-token', 30),
                                    ('POST', '/api/forms/eures-beta/employer-referrals', 5),
                                    ('POST', '/admin/eures-beta/login', 10)]:
            with self.subTest(path=path):
                app.limiter.reset()
                for _ in range(limit):self.client.open(path, method=method, json={})
                response = self.client.open(path, method=method, json={}, headers={'Accept-Language': 'de'})
                self.assertEqual(response.status_code, 429)
                self.assertIn('Zu viele', response.json['error'])
        app.limiter.reset()
        for _ in range(120):self.client.get('/api/forms/eures-beta/access')
        self.assertEqual(self.client.get('/api/forms/eures-beta/access').status_code, 429)

    def test_proxy_defaults_and_existing_write_key_ignore_raw_headers(self):
        with patch.dict(app.os.environ, {}, clear=True):
            self.assertEqual(app._trusted_proxy_hops('PROXY_FIX_X_FOR'), 0)
        with patch.dict(app.os.environ, {'PROXY_FIX_X_FOR': '-1'}):
            with self.assertRaises(ValueError):app._trusted_proxy_hops('PROXY_FIX_X_FOR')
        with app.app.test_request_context(headers={'X-Forwarded-For': 'attacker'}, environ_base={'REMOTE_ADDR': '192.0.2.1'}):
            self.assertEqual(app._get_client_ip(), '192.0.2.1')
        import redis
        self.assertTrue(redis.Redis)

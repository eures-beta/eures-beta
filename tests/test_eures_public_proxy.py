import unittest
from unittest.mock import patch
import app


class EuresLocalRoutingTest(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()

    def test_form_is_served_locally_on_any_host_without_proxying(self):
        with patch.object(app.requests, 'request') as request:
            for host in ['https://app.example.test', 'http://localhost:5005']:
                response = self.client.get('/forms/eures-beta/', base_url=host)
                self.assertEqual(response.status_code, 200)
                self.assertIn(b'<html', response.data)
                response.close()
        request.assert_not_called()

    def test_admin_requires_local_auth_instead_of_upstream_forwarding(self):
        with (
            patch.dict(
                app.os.environ,
                {
                    'ADMIN_AUTH_MODE_EURES_BETA': 'basic',
                    'ADMIN_USERNAME_EURES_BETA': 'fictional',
                    'ADMIN_PASSWORD_EURES_BETA': 'fictional-secret',
                },
            ),
            patch.object(app.requests, 'request') as request,
        ):
            response = self.client.get(
                '/admin/eures-beta/', base_url='https://app.example.test'
            )
        self.assertEqual(response.status_code, 401)
        request.assert_not_called()

    def test_old_proxy_flag_cannot_enable_forwarding(self):
        with (
            patch.dict(app.os.environ, {'EURES_PUBLIC_PROXY_ENABLED': 'true'}),
            app.app.test_request_context('/'),
        ):
            self.assertFalse(app.should_proxy_eures_public_request('eures-beta'))
            self.assertIsNone(app.maybe_proxy_eures_request('eures-beta'))

    def test_public_urls_use_configuration_or_request_origin(self):
        with patch.dict(
            app.os.environ, {'PUBLIC_APP_BASE_URL': 'https://configured.example.test/'}
        ):
            self.assertEqual(
                app.get_public_app_base_url(), 'https://configured.example.test'
            )
        with (
            patch.dict(app.os.environ, {'PUBLIC_APP_BASE_URL': ''}),
            app.app.test_request_context('/', base_url='https://app.example.test'),
        ):
            self.assertEqual(app.get_public_app_base_url(), 'https://app.example.test')
        with patch.dict(app.os.environ, {'PUBLIC_APP_BASE_URL': ''}):
            with self.assertRaisesRegex(RuntimeError, 'PUBLIC_APP_BASE_URL'):
                app.get_public_app_base_url()

    def test_home_does_not_depend_on_a_provider_hostname(self):
        with patch.object(app, 'APP_MODE', ''):
            response = self.client.get('/', base_url='https://app.example.test')
        self.assertEqual(response.headers['Location'], '/forms/eures-beta/')

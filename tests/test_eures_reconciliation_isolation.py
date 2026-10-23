import sys
import unittest
from unittest.mock import patch

import app


class ReconciliationIsolationTest(unittest.TestCase):
    def test_other_form_routes_are_rejected_before_services_are_called(self):
        client = app.app.test_client()
        with (
            patch.object(app, 'APP_MODE', 'eures-beta'),
            patch.object(app, 'get_form_config') as config,
        ):
            for method, path in [
                ('GET', '/forms/fagerh/'),
                ('POST', '/api/forms/fagerh/record'),
                ('GET', '/admin/fagerh/login'),
                ('GET', '/api/forms/fagerh/admin/employers'),
            ]:
                with self.subTest(path=path):
                    response = client.open(path, method=method, json={})
                    self.assertEqual(response.status_code, 404)
                    response.close()
            config.assert_not_called()

    def test_fagerh_analytics_is_not_loaded_or_registered(self):
        self.assertFalse(
            any(name.startswith('fagerh_analytics') for name in sys.modules)
        )
        rules = [rule.rule for rule in app.app.url_map.iter_rules()]
        self.assertFalse(any('/fagerh/' in rule for rule in rules))
        self.assertFalse(any('fagerh' in name for name in app.app.blueprints))

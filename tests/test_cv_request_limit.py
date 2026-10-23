import base64
from contextlib import ExitStack
import unittest
from unittest.mock import Mock, patch
import app


class CVRequestLimitTest(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()

    def submit(self, size):
        fields = {
            'id_tally': 'fictional-cv-id',
            'flow_role': 'candidate',
            'cv_file_name': 'fictional.pdf',
            'cv_file_mime': 'application/pdf',
            'cv_file_size': size,
            'cv_file_base64': base64.b64encode(b'x' * size).decode('ascii'),
        }
        response = Mock(status_code=200)
        with ExitStack() as stack:
            values = {
                'maybe_proxy_eures_request': None,
                'get_form_access_settings': {'read_only': False},
                '_validate_eures_public_write_token': (True, ''),
                '_check_eures_public_write_rate_limit': (True, 0),
                'get_form_config': {
                    'doc_id': 'fictional',
                    'table_id': 'Candidats',
                    'api_key': 'fictional',
                },
                'ensure_table_columns': None,
                'get_table_columns': set(fields) | {'cv_uploaded_at', 'tally_q36'},
                'find_duplicate_finess': set(),
                'write_grist_records': response,
                'run_eures_matching_for_saved_record': {
                    'processed': True,
                    'no_immediate_match': False,
                },
                'link_eures_invitation_after_save': {'linked': False},
                '_record_eures_visit_analytics_event': None,
            }
            mocks = {
                name: stack.enter_context(patch.object(app, name, return_value=value))
                for name, value in values.items()
            }
            stack.enter_context(
                patch.object(
                    app,
                    'fetch_record_by_field',
                    side_effect=[
                        (None, response),
                        ({'id': 1, 'fields': fields}, response),
                    ],
                )
            )
            result = self.client.post(
                '/api/forms/eures-beta/record', json={'fields': fields}
            )
        return result, mocks

    def test_maximum_advertised_cv_is_saved(self):
        result, mocks = self.submit(app.EURES_CV_MAX_BYTES)
        self.assertEqual(result.status_code, 200)
        payload = mocks['write_grist_records'].call_args.args[2]
        self.assertEqual(
            payload['records'][0]['fields']['cv_file_size'], app.EURES_CV_MAX_BYTES
        )
        self.assertEqual(app.app.config['MAX_CONTENT_LENGTH'], 2 * 1024 * 1024)

    def test_oversized_cv_still_rejected_before_any_write(self):
        result, mocks = self.submit(app.EURES_CV_MAX_BYTES + 1)
        self.assertEqual(result.status_code, 400)
        mocks['write_grist_records'].assert_not_called()
        mocks['get_form_config'].assert_called_once()

    def test_questionnaire_http_body_is_still_bounded(self):
        with patch.object(app, 'get_form_config') as config:
            result = self.client.post(
                '/api/forms/eures-beta/record',
                data=b' ' * (app.EURES_RECORD_MAX_CONTENT_LENGTH + 1),
                content_type='application/json',
            )
        self.assertEqual(result.status_code, 413)
        config.assert_not_called()

    def test_export_keeps_smaller_limit_after_large_submission(self):
        self.assertEqual(self.submit(app.EURES_CV_MAX_BYTES)[0].status_code, 200)
        with patch.object(app, 'build_readable_xlsx') as build:
            result = self.client.post(
                '/api/forms/eures-beta/export-readable-xlsx',
                data=b' ' * (2 * 1024 * 1024 + 1),
                content_type='application/json',
            )
        self.assertEqual(result.status_code, 413)
        build.assert_not_called()

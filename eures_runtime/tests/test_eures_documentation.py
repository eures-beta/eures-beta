import json
import os
import unittest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

import app


class EuresDocumentationTest(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()
        self.env = {
            'ADMIN_AUTH_MODE_EURES_BETA': 'basic',
            'ADMIN_USERNAME_EURES_BETA': 'admin',
            'ADMIN_PASSWORD_EURES_BETA': 'secret',
            'SESSION_SECRET': 'session-secret',
        }
        self.auth = {'Authorization': 'Basic YWRtaW46c2VjcmV0'}

    def test_document_validation_keeps_roles_links_and_history(self):
        existing = {
            **app._documentation_default_document(),
            'record_id': 4,
            'titre': 'Ancien titre',
            'contenu_markdown': '# Ancien contenu',
            'created_at': '2026-09-01T08:00:00Z',
            'updated_at': '2026-09-01T09:00:00Z',
        }
        result = app.validate_documentation_document({
            'titre': 'Architecture ETEN',
            'contenu_markdown': '# Architecture\n\nContenu',
            'categorie': 'technique',
            'statut': 'published',
            'cartes_liees': ['eures-16', 'invalide', 'EURES-18'],
            'liens': ['https://example.org/reference', 'javascript:alert(1)'],
        }, existing=existing, actor='eric@example.org')

        self.assertEqual(result['errors'], [])
        document = result['document']
        self.assertEqual(document['categorie'], 'technique')
        self.assertEqual(document['statut'], 'published')
        self.assertEqual(document['cartes_liees'], ['EURES-16', 'EURES-18'])
        self.assertEqual(document['liens'], ['https://example.org/reference'])
        self.assertEqual(document['auteur'], 'eric@example.org')
        self.assertEqual(document['historique'][-1]['contenu_markdown'], '# Ancien contenu')
        self.assertTrue(result['warnings'])

    def test_document_validation_requires_title_and_content(self):
        result = app.validate_documentation_document({}, actor='admin')
        self.assertEqual(len(result['errors']), 2)

    @patch.object(app, '_documentation_table_ready')
    @patch.object(app, 'fetch_table_records')
    def test_list_api_returns_documents(self, fetch_table_records, table_ready):
        table_ready.return_value = ({'doc_id': 'doc', 'table_id': 'Documentation_Projet'}, {})
        fetch_table_records.return_value = [{
            'id': 7,
            'fields': {
                'document_id': 'doc_alpha',
                'titre': 'Décision pilote',
                'contenu_markdown': '# Décision',
                'categorie': 'decisions',
                'statut': 'published',
                'langue_source': 'fr',
                'cartes_liees_json': json.dumps(['EURES-16']),
                'liens_json': '[]',
                'historique_json': '[]',
                'updated_at': '2026-09-02T10:00:00Z',
            },
        }]

        with patch.dict(os.environ, self.env, clear=False):
            response = self.client.get(
                '/api/forms/eures-beta/admin/documentation/documents',
                headers=self.auth,
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload['documents'][0]['record_id'], 7)
        self.assertEqual(payload['documents'][0]['cartes_liees'], ['EURES-16'])

    @patch.object(app, '_documentation_table_ready')
    @patch.object(app, 'fetch_record_by_id')
    def test_save_rejects_stale_version(self, fetch_record_by_id, table_ready):
        table_ready.return_value = ({'doc_id': 'doc', 'table_id': 'Documentation_Projet'}, {})
        fetch_record_by_id.return_value = {
            'id': 7,
            'fields': {
                'document_id': 'doc_alpha',
                'titre': 'Version récente',
                'contenu_markdown': '# Récent',
                'categorie': 'technique',
                'statut': 'published',
                'langue_source': 'fr',
                'cartes_liees_json': '[]',
                'liens_json': '[]',
                'historique_json': '[]',
                'created_at': '2026-09-02T09:00:00Z',
                'updated_at': '2026-09-02T11:00:00Z',
            },
        }

        with patch.dict(os.environ, self.env, clear=False):
            response = self.client.patch(
                '/api/forms/eures-beta/admin/documentation/documents/7',
                headers={**self.auth, 'Content-Type': 'application/json'},
                json={
                    'record_id': 7,
                    'titre': 'Ma modification',
                    'contenu_markdown': '# Texte',
                    'expected_updated_at': '2026-09-02T10:00:00Z',
                },
            )

        self.assertEqual(response.status_code, 409)
        self.assertTrue(response.get_json()['conflict'])

    def test_documentation_page_requires_authentication(self):
        with patch.dict(os.environ, self.env, clear=False):
            response = self.client.get('/admin/eures-beta/documentation')
        self.assertEqual(response.status_code, 401)

    def test_documentation_page_is_served_to_admin(self):
        with patch.dict(os.environ, self.env, clear=False):
            response = self.client.get('/admin/eures-beta/documentation', headers=self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertIn('Documentation projet', response.get_data(as_text=True))

    def test_private_document_requires_authentication(self):
        with patch.dict(os.environ, self.env, clear=False):
            response = self.client.get(
                '/admin/eures-beta/documentation/files/note-conception-eten-v0.pdf'
            )
        self.assertEqual(response.status_code, 401)

    def test_private_document_is_served_to_admin(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder = root / 'eures-beta'
            folder.mkdir()
            (folder / 'Note_de_conception_ETEN_V0.pdf').write_bytes(b'%PDF-1.4\nSynthetic routing fixture\n')
            with patch.object(app, 'PRIVATE_DOCUMENTS_DIR', root), patch.dict(os.environ, self.env, clear=False):
                response = self.client.get(
                    '/admin/eures-beta/documentation/files/note-conception-eten-v0.pdf',
                    headers=self.auth,
                )
                response.get_data()
                response.close()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'application/pdf')
        self.assertTrue(response.get_data().startswith(b'%PDF'))

    def test_private_document_route_uses_an_allowlist(self):
        with patch.dict(os.environ, self.env, clear=False):
            response = self.client.get(
                '/admin/eures-beta/documentation/files/app.py',
                headers=self.auth,
            )
        self.assertEqual(response.status_code, 404)


if __name__ == '__main__':
    unittest.main()

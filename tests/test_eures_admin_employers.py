import os
import unittest
from unittest.mock import patch

import app


def rec(record_id, **fields):
    return {'id': record_id, 'fields': fields}


class EuresAdminEmployersTest(unittest.TestCase):
    def setUp(self):
        self.client = app.app.test_client()
        self.env = {
            'ADMIN_AUTH_MODE_EURES_BETA': 'basic',
            'ADMIN_USERNAME_EURES_BETA': 'admin',
            'ADMIN_PASSWORD_EURES_BETA': 'secret',
            'SESSION_SECRET': 'session-secret',
        }
        self.admin_auth = {'Authorization': 'Basic YWRtaW46c2VjcmV0'}

    def _open_admin_session(self):
        return self.admin_auth

    def _mock_config(self):
        return {'doc_id': 'doc', 'table_id': 'unused', 'api_key': 'token'}

    def _records_by_table(self):
        return {
            app.EURES_ENTREPRISES_TABLE: [
                rec(
                    2,
                    entreprise_id='ME-ENT-0002',
                    nom_affiche='Beta',
                    pays='Luxembourg',
                    ville_ou_lieu='',
                    secteurs='',
                    statut='a_qualifier',
                    notes='',
                ),
                rec(
                    1,
                    entreprise_id='ME-ENT-0001',
                    nom_affiche='Alpha',
                    pays='Luxembourg',
                    ville_ou_lieu='Luxembourg',
                    secteurs='Nettoyage',
                    statut='actif',
                    notes='Note alpha',
                ),
                rec(
                    3,
                    entreprise_id='ME-ENT-0003',
                    nom_affiche='Gamma',
                    pays='Luxembourg',
                    ville_ou_lieu='Berchem',
                    secteurs='',
                    statut='actif',
                    notes='',
                ),
            ],
            app.EURES_CONTACTS_ENTREPRISES_TABLE: [
                rec(
                    11,
                    contact_id='ME-CON-0001',
                    entreprise_id='ME-ENT-0001',
                    nom='Dupont',
                    prenom='Alice',
                    email='alice@example.org',
                    telephone='1',
                    fonction='RH',
                    est_contact_principal=False,
                    statut='actif',
                ),
                rec(
                    12,
                    contact_id='ME-CON-0002',
                    entreprise_id='ME-ENT-0001',
                    nom='Martin',
                    prenom='Bob',
                    email='bob@example.org',
                    telephone='',
                    fonction='',
                    est_contact_principal=False,
                    statut='a_verifier',
                ),
                rec(
                    31,
                    contact_id='ME-CON-0003',
                    entreprise_id='ME-ENT-0003',
                    nom='Durand',
                    prenom='Claire',
                    email='claire@example.org',
                    telephone='3',
                    fonction='Direction',
                    est_contact_principal=True,
                    statut='actif',
                ),
            ],
            app.EURES_BESOINS_TABLE: [
                rec(
                    101,
                    id_tally='need-1',
                    entreprise_id='ME-ENT-0001',
                    contact_id='ME-CON-0001',
                    tally_q02='Agent de nettoyage',
                    tally_q03='2',
                    lieu_travail_normalise='Luxembourg',
                    tally_submitted_at='2026-08-01T08:00:00Z',
                ),
                rec(
                    102,
                    id_tally='need-2',
                    entreprise_id='ME-ENT-0001',
                    contact_id='ME-CON-0002',
                    tally_q02='Opérateur',
                    tally_q03='1',
                    lieu_travail_normalise='',
                    tally_submitted_at='not-a-date',
                ),
                rec(
                    301,
                    id_tally='need-3',
                    entreprise_id='ME-ENT-0003',
                    contact_id='ME-CON-0003',
                    tally_q02='Serveur',
                    tally_q03='',
                    pays='Luxembourg',
                ),
            ],
            app.EURES_MATCHINGS_TABLE: [
                rec(
                    201,
                    besoin_id='need-1',
                    candidat_id='cand-1',
                    admin_status='accepted',
                    workflow_status='valide_admin',
                    date_calcul='2026-08-02T08:00:00Z',
                    admin_decision_at='2026-08-03T08:00:00Z',
                ),
                rec(
                    202,
                    besoin_id='need-1',
                    candidat_id='cand-2',
                    workflow_status='envoye_employeur',
                    date_calcul='2026-08-02T09:00:00Z',
                    sent_to_employer_at='2026-08-04T08:00:00Z',
                ),
                rec(
                    203,
                    besoin_id='need-1',
                    candidat_id='cand-3',
                    employer_response='contact',
                    employer_response_at='2026-08-05T08:00:00Z',
                    mise_en_relation_at='2026-08-06T08:00:00Z',
                    relation_result_at='bad-date',
                ),
                rec(
                    204,
                    besoin_id='need-2',
                    candidat_id='cand-4',
                    admin_status='refused',
                    workflow_status='refuse_admin',
                    date_calcul='2026-08-02T10:00:00Z',
                    admin_decision_at='2026-08-03T09:00:00Z',
                ),
            ],
        }

    def _patch_grist_reads(
        self, fetch_table_records, get_form_config, get_eures_matching_config
    ):
        records_by_table = self._records_by_table()
        get_form_config.return_value = self._mock_config()
        get_eures_matching_config.return_value = {
            'doc_id': 'doc',
            'table_id': app.EURES_MATCHINGS_TABLE,
            'api_key': 'token',
        }
        fetch_table_records.side_effect = (
            lambda _doc_id, table_id, _headers, limit=5000: records_by_table.get(
                table_id, []
            )
        )

    def test_admin_api_requires_authentication(self):
        with patch.dict(os.environ, self.env, clear=False):
            response = self.client.get('/api/forms/eures-beta/admin/employers')

        self.assertEqual(response.status_code, 401)
        self.assertIn('Authentication required', response.get_data(as_text=True))

    def test_admin_api_rejects_non_eures_form(self):
        with patch.dict(os.environ, self.env, clear=False):
            self._open_admin_session()
            response = self.client.get('/api/forms/fagerh/admin/employers')

        self.assertIn(response.status_code, {401, 404})

    @patch.object(app, 'fetch_table_records')
    @patch.object(app, 'get_form_config')
    @patch.object(app, 'get_eures_matching_config')
    def test_returns_enterprises_contacts_needs_indicators_and_history(
        self, get_eures_matching_config, get_form_config, fetch_table_records
    ):
        self._patch_grist_reads(
            fetch_table_records, get_form_config, get_eures_matching_config
        )

        with patch.dict(os.environ, self.env, clear=False):
            response = self.client.get(
                '/api/forms/eures-beta/admin/employers',
                headers=self._open_admin_session(),
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload['ok'])
        self.assertEqual(payload['stats']['total'], 3)
        self.assertEqual(
            [row['nom'] for row in payload['rows']], ['Alpha', 'Beta', 'Gamma']
        )

        alpha = payload['rows'][0]
        self.assertIsNone(alpha['contact_principal'])
        self.assertEqual(len(alpha['contacts']), 2)
        self.assertEqual(len(alpha['besoins']), 2)
        need_1 = alpha['besoins'][0]
        self.assertEqual(need_1['poste'], 'Agent de nettoyage')
        self.assertEqual(need_1['nombre_postes'], '2')
        self.assertEqual(need_1['statut'], None)
        self.assertEqual(
            need_1['indicators'],
            {
                'identified': 3,
                'validated': 1,
                'presented': 2,
                'employer_interested': 1,
                'introduction_done': 1,
            },
        )
        self.assertEqual(
            [event['type'] for event in need_1['history'][:2]],
            ['mise_en_relation', 'employeur_interesse'],
        )
        self.assertNotIn(
            'issue_relation', [event['type'] for event in need_1['history']]
        )

        need_2 = alpha['besoins'][1]
        self.assertEqual(need_2['indicators']['identified'], 1)
        self.assertEqual(need_2['indicators']['validated'], 0)
        self.assertEqual(
            [event['type'] for event in need_2['history']],
            ['matching_refuse', 'matching_calcule'],
        )

        gamma = payload['rows'][2]
        self.assertEqual(gamma['contact_principal']['contact_id'], 'ME-CON-0003')
        self.assertEqual(gamma['besoins'][0]['indicators']['identified'], 0)
        self.assertEqual(gamma['history'], [])

    @patch.object(app, 'fetch_table_records')
    @patch.object(app, 'get_form_config')
    @patch.object(app, 'get_eures_matching_config')
    def test_handles_enterprise_without_contact_or_need(
        self, get_eures_matching_config, get_form_config, fetch_table_records
    ):
        self._patch_grist_reads(
            fetch_table_records, get_form_config, get_eures_matching_config
        )

        with patch.dict(os.environ, self.env, clear=False):
            response = self.client.get(
                '/api/forms/eures-beta/admin/employers',
                headers=self._open_admin_session(),
            )

        beta = response.get_json()['rows'][1]
        self.assertEqual(beta['entreprise_id'], 'ME-ENT-0002')
        self.assertIsNone(beta['contact_principal'])
        self.assertEqual(beta['contacts'], [])
        self.assertEqual(beta['besoins'], [])
        self.assertEqual(beta['history'], [])


if __name__ == '__main__':
    unittest.main()

import unittest
from unittest.mock import Mock

from eures_grist import EuresGrist
from eures_matching import matching_workflow_status


class PortableMatchingWorkflowTests(unittest.TestCase):
    def client(self, existing):
        client = EuresGrist(environ={}, transport=Mock())
        client._request = Mock(side_effect=[
            {"records": existing},
            {"columns": [
                {"id": name, "fields": {"type": "Text"}}
                for name in ("besoin_id", "candidat_id", "score", "statut", "workflow_status")
            ]},
            {},
        ])
        return client

    def test_new_matching_gets_review_state_before_create(self):
        client = self.client([])
        result = client.upsert_matching({
            "besoin_id": "fictional-need", "candidat_id": "fictional-candidate",
            "score": 80, "statut": "auto_envoyable",
        })
        self.assertEqual(result, "created")
        call = client._request.call_args
        self.assertEqual(call.args[0], "POST")
        self.assertEqual(call.kwargs["json"]["records"][0]["fields"]["workflow_status"],
                         "a_valider_admin")

    def test_recalculation_preserves_existing_human_decision(self):
        client = self.client([{"id": 7, "fields": {"admin_status": "refused"}}])
        result = client.upsert_matching({
            "besoin_id": "fictional-need", "candidat_id": "fictional-candidate",
            "score": 90, "statut": "auto_envoyable",
        })
        self.assertEqual(result, "updated")
        call = client._request.call_args
        self.assertEqual(call.args[0], "PATCH")
        self.assertEqual(call.kwargs["json"]["records"][0]["fields"]["workflow_status"],
                         "refuse_admin")

    def test_explicit_state_and_completed_steps_have_priority(self):
        self.assertEqual(matching_workflow_status({
            "workflow_status": "archive", "embauche_confirmee_at": "fictional-date",
        }), "archive")
        self.assertEqual(matching_workflow_status({
            "embauche_confirmee_at": "fictional-date", "admin_status": "refused",
        }), "embauche_confirmee")
        self.assertEqual(matching_workflow_status({}), "calcule")

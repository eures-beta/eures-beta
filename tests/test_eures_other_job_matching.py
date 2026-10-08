import unittest

import app


class EuresOtherJobMatchingTest(unittest.TestCase):
    def test_reference_sector_matching_is_unchanged(self):
        score, reason = app.eures_score_sector_fit(
            "Nettoyage et entretien",
            "Nettoyage et entretien",
        )

        self.assertEqual(score, 18)
        self.assertIn("secteur exact", reason)

    def test_free_job_is_marked_for_qualification_without_zero_sector_score(self):
        score, reason = app.eures_score_sector_fit(
            "Nettoyage et entretien",
            "",
            "Agent de nettoyage",
        )

        self.assertGreater(score, 0)
        self.assertIn("qualifier", reason)

    def test_free_job_can_support_job_title_matching_without_entering_reference(self):
        matching = app.compute_eures_matching(
            {
                "poste": "Nettoyage et entretien",
                "tally_q11_job_title": "Agent de nettoyage",
                "competences_clefs": "",
                "langues_requises": "",
                "pays": "",
                "date_debut": "",
                "contraintes_travail": "",
                "permis_autorisations": "",
            },
            {
                "metier": "",
                "metier_libre": "Agent de nettoyage",
                "competences": "",
                "langues": "",
                "pays": "",
                "mobilite": "",
                "disponibilite": "",
                "contraintes_travail": "",
                "permis_autorisations": "",
            },
        )

        self.assertGreater(matching["score_metier"], 0)
        self.assertIn("metier libre a qualifier", matching["raisons"])
        self.assertIn("intitule: exact", matching["raisons"])


if __name__ == "__main__":
    unittest.main()

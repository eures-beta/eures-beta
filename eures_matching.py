"""Matching workflow states shared by the portable Grist client.

Keep the historical Flask workflow precedence, without importing the web app.
"""


def initial_matching_workflow_status(scoring_status: str) -> str:
    status = str(scoring_status or "").strip().lower()
    return "a_valider_admin" if status in {"a_valider", "auto_envoyable"} else "calcule"


def matching_workflow_status(fields: dict) -> str:
    fields = fields or {}
    current = str(fields.get("workflow_status") or "").strip().lower()
    if current:
        return current
    if fields.get("embauche_confirmee_at"):
        return "embauche_confirmee"
    if fields.get("mise_en_relation_at"):
        return "mise_en_relation_faite"
    response = str(fields.get("employer_response") or "").strip().lower()
    if response == "contact":
        return "accepte_employeur"
    if response == "not_contact":
        return "refuse_employeur"
    if fields.get("sent_to_employer_at"):
        return "envoye_employeur"
    admin = str(fields.get("admin_status") or "").strip().lower()
    if admin == "accepted":
        return "envoye_employeur"
    if admin == "refused":
        return "refuse_admin"
    return initial_matching_workflow_status(fields.get("statut", ""))

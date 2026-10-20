"""EURES-only Grist access for public responses and matching.

Response saves, matching writes and pending follow-up initialization write to Grist.
They never create tables or columns.
The document, key and table names come from EURES-specific configuration.
"""

import json
import os
import threading
from datetime import datetime, timezone

import requests

from eures_transport import EuresTransport

from eures_score_storage import serialize_matching_score


class GristUnavailable(Exception):
    pass


class EuresSaveUncertain(GristUnavailable):
    """A Grist write was attempted, but its outcome could not be verified."""


class EuresIdentifierColumnsMissing(GristUnavailable):
    """The EURES target table has neither supported questionnaire key."""


class EuresGrist:
    TABLES = {"candidate": "Candidats", "employer": "Besoins_Employeurs"}
    MATCHINGS_TABLE = "Matchings"
    ENTERPRISES_TABLE = "Entreprises"
    ENTERPRISE_CONTACTS_TABLE = "Contacts_Entreprises"
    NETWORK_CONTACTS_TABLE = "Contacts_Initiative"
    _pair_locks = [threading.Lock() for _ in range(256)]
    PENDING_FOLLOWUPS = {
        "no_match": ("no_match_notification_status", {
            "no_match_notification_reason": "no_immediate_match",
            "no_match_notification_created_by": "system_matching",
            "no_match_notification_note": "",
        }, "no_match_notification_created_at"),
        "new_job": ("new_job_request_status", {
            "new_job_request_created_by": "system_questionnaire_submission",
            "new_job_request_note": "",
        }, "new_job_request_created_at"),
    }

    def __init__(self, environ=None, transport=None):
        config = os.environ if environ is None else environ
        self.base_url = config.get("GRIST_BASE_URL", "https://grist.numerique.gouv.fr").rstrip("/")
        self.doc_id = config.get("GRIST_DOC_EURES_BETA", "").strip()
        self.api_key = config.get("GRIST_API_KEY_EURES_BETA", "").strip()
        self.tables = {
            role: config.get(f"GRIST_TABLE_EURES_BETA_{role.upper()}", default).strip()
            for role, default in self.TABLES.items()
        }
        self.invitations_table = config.get("GRIST_TABLE_EURES_BETA_INVITATIONS", "Invitations").strip()
        self.stats_table = config.get("GRIST_TABLE_EURES_BETA_STATS", "Pilotage_EURES_Mensuel").strip()
        self.tracking_table = config.get("GRIST_TABLE_EURES_BETA_TRACKING", "Suivi_Projet").strip()
        self.documentation_table = config.get("GRIST_TABLE_EURES_BETA_DOCUMENTATION", "Documentation_Projet").strip()
        self.visits_table = config.get("GRIST_TABLE_EURES_BETA_VISIT_ANALYTICS", "Visites_Match_Europe").strip()
        self.transport = transport if transport is not None else EuresTransport(config)

    def list_records(self, table):
        if not table or table not in {*self.tables.values(), self.MATCHINGS_TABLE,
                                      self.invitations_table, self.stats_table,
                                      self.tracking_table, self.documentation_table,
                                      self.visits_table,
                                      self.ENTERPRISES_TABLE, self.ENTERPRISE_CONTACTS_TABLE,
                                      self.NETWORK_CONTACTS_TABLE}:
            raise ValueError("Unsupported EURES table")
        return self._request("GET", f"tables/{table}/records", params={"limit": 5000}).get("records", [])

    def list_public_stats_records(self, kind):
        """Project at the source using read-only SQL, with no row limit.

        Schema discovery preserves the calculator's defaults for absent optional
        columns. Never fall back to full-record reads when SQL is unavailable.
        SQL returns every row in one query, avoiding inconsistent page boundaries.
        """
        from eures_public_stats import PUBLIC_STATS_COLUMNS

        tables = {'candidate': self.tables['candidate'],
                  'employer': self.tables['employer'],
                  'matching': self.MATCHINGS_TABLE,
                  'invitation': self.invitations_table, 'monthly': self.stats_table}
        if kind not in PUBLIC_STATS_COLUMNS or not tables[kind]:
            raise ValueError("Unsupported EURES statistics table")
        table = tables[kind]
        schema = self._request("GET", f"tables/{table}/columns")
        columns = schema.get('columns') if isinstance(schema, dict) else None
        if not isinstance(columns, list):
            raise GristUnavailable("Invalid EURES statistics schema")
        existing = {column.get('id') for column in columns if isinstance(column, dict)}
        selected = [name for name in PUBLIC_STATS_COLUMNS[kind] if name in existing]
        # A constant still counts rows when none of the optional fields exist.
        def quote(identifier):
            return '"' + identifier.replace('"', '""') + '"'
        projection = ', '.join(map(quote, selected)) if selected else '1 AS "_row"'
        payload = self._request("GET", "sql", params={
            'q': f'SELECT {projection} FROM {quote(table)}',
        })
        records = payload.get('records') if isinstance(payload, dict) else None
        if not isinstance(records, list):
            raise GristUnavailable("Invalid EURES statistics response")
        result = []
        for record in records:
            if not isinstance(record, dict) or not isinstance(record.get('fields'), dict):
                raise GristUnavailable("Invalid EURES statistics record")
            if not set(selected) <= record['fields'].keys():
                raise GristUnavailable("Incomplete EURES statistics projection")
            result.append({'fields': {name: record['fields'][name] for name in selected}})
        return result

    def get_invitation_by_id(self, record_id):
        if type(record_id) is not int or record_id < 1:
            raise ValueError("Invalid EURES invitation record ID")
        path = f"tables/{self.invitations_table}/records"
        payload = self._request("GET", path, params={
            "filter": json.dumps({"id": [record_id]}),
        })
        records = payload.get("records") if isinstance(payload, dict) else None
        if not isinstance(records, list) or len(records) > 1:
            raise GristUnavailable("Invalid EURES invitation response")
        if records and records[0].get("id") != record_id:
            raise GristUnavailable("Mismatched EURES invitation response")
        return records[0] if records else None

    def get_network_contact_by_id(self, record_id):
        """Read one EURES network contact; never create or alter a column."""
        if type(record_id) is not int or record_id < 1:
            raise ValueError("Invalid EURES network contact record ID")
        payload = self._request("GET", f"tables/{self.NETWORK_CONTACTS_TABLE}/records",
                                params={"filter": json.dumps({"id": [record_id]})})
        records = payload.get("records") if isinstance(payload, dict) else None
        if not isinstance(records, list) or len(records) > 1:
            raise GristUnavailable("Invalid EURES network contact response")
        if records and records[0].get("id") != record_id:
            raise GristUnavailable("Mismatched EURES network contact response")
        return records[0] if records else None

    def write_invitation_admin(self, fields, record_id=None):
        """Create or patch one invitation with an existing schema and no send fields."""
        allowed = {"role", "email", "first_name", "last_name", "company_name",
                   "language", "source", "external_ref", "invitation_status",
                   "invitation_status_updated_at", "invitation_status_updated_by",
                   "imported_at", "imported_by", "sponsor_invitation_record_id",
                   "sponsor_email", "sponsor_company_name", "invited_by_type",
                   "invite_scope", "notes"}
        if (not isinstance(fields, dict) or not fields or not set(fields) <= allowed
                or (record_id is not None and (type(record_id) is not int or record_id < 1))):
            raise ValueError("Invalid EURES invitation fields")
        if record_id is None and not {"role", "email", "invitation_status"} <= set(fields):
            raise ValueError("Missing EURES invitation identity")
        path = f"tables/{self.invitations_table}"
        payload = self._request("GET", f"{path}/columns")
        columns = payload.get("columns") if isinstance(payload, dict) else None
        if not isinstance(columns, list):
            raise GristUnavailable("Invalid EURES Invitations schema")
        existing = {column.get("id") for column in columns if isinstance(column, dict)}
        if not set(fields) <= existing:
            raise GristUnavailable("EURES Invitations table is missing required columns")
        record = {"fields": fields}
        if record_id is not None:
            record["id"] = record_id
        response = self._request("PATCH" if record_id is not None else "POST",
                                 f"{path}/records", json={"records": [record]})
        if not isinstance(response, dict):
            raise GristUnavailable("Invalid EURES invitation write response")
        return response

    def get_column_types(self, table):
        """Read only the Grist types needed to validate EURES salary amounts."""
        if table not in self.tables.values():
            raise ValueError("Unsupported EURES response table")
        columns = self._request("GET", f"tables/{table}/columns").get("columns", [])
        return {column["id"]: column.get("fields", {}).get("type")
                for column in columns if isinstance(column, dict) and column.get("id")}

    def initialize_pending_followup(self, role, record_id, kind):
        """Queue a follow-up on one newly saved EURES response, without schema creation."""
        if (role not in self.TABLES or kind not in self.PENDING_FOLLOWUPS
                or (kind == "new_job" and role != "employer")
                or type(record_id) is not int or record_id < 1):
            raise ValueError("Invalid EURES pending follow-up target")
        table = self.tables[role]
        if not table:
            raise GristUnavailable("EURES response table is not configured")
        prefix = f"tables/{table}"
        status_column, fixed, date_column = self.PENDING_FOLLOWUPS[kind]
        fields = {status_column: "pending", **fixed,
                  date_column: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
        columns = self._request("GET", f"{prefix}/columns").get("columns", [])
        available = {column.get("id") for column in columns if isinstance(column, dict)}
        if not set(fields) <= available:
            raise GristUnavailable("EURES follow-up columns are missing")
        records = self._request("GET", f"{prefix}/records", params={
            "filter": json.dumps({"id": [record_id]}),
        }).get("records", [])
        if (not isinstance(records, list) or len(records) != 1
                or records[0].get("id") != record_id):
            raise GristUnavailable("EURES follow-up response record is unavailable")
        current = records[0].get("fields", {}).get(status_column)
        normalized = str(current or "").strip().lower()
        if normalized == "pending":
            return "already_pending"
        terminal = {"no_match": {"sent", "dismissed"},
                    "new_job": {"processed", "dismissed"}}
        if normalized in terminal[kind]:
            return "preserved_manual_status"
        if normalized:
            raise GristUnavailable("Unexpected EURES follow-up status")
        self._request("PATCH", f"{prefix}/records", json={
            "records": [{"id": record_id, "fields": fields}],
        })
        return "queued"

    def get_matching_by_id(self, record_id):
        """Read one EURES matching for an administrative decision."""
        if type(record_id) is not int or record_id < 1:
            raise ValueError("Invalid EURES matching record ID")
        payload = self._request("GET", "tables/Matchings/records", params={
            "filter": json.dumps({"id": [record_id]}),
        })
        records = payload.get("records") if isinstance(payload, dict) else None
        if not isinstance(records, list) or len(records) > 1:
            raise GristUnavailable("Invalid EURES matching response")
        if records and records[0].get("id") != record_id:
            raise GristUnavailable("Mismatched EURES matching response")
        return records[0] if records else None

    def update_matching_admin(self, record_id, fields):
        """Patch only administrative fields after checking the existing schema."""
        allowed = {"admin_status", "admin_decision_at", "admin_decision_by",
                   "admin_decision_note", "workflow_status", "workflow_status_updated_at",
                   "workflow_status_updated_by"}
        if (type(record_id) is not int or record_id < 1 or not isinstance(fields, dict)
                or set(fields) != allowed):
            raise ValueError("Invalid EURES administrative matching update")
        payload = self._request("GET", "tables/Matchings/columns")
        columns = payload.get("columns") if isinstance(payload, dict) else None
        if not isinstance(columns, list):
            raise GristUnavailable("Invalid EURES Matchings schema")
        existing = {column.get("id") for column in columns if isinstance(column, dict)}
        if not allowed <= existing:
            raise GristUnavailable("EURES Matchings table is missing administrative columns")
        self._request("PATCH", "tables/Matchings/records", json={
            "records": [{"id": record_id, "fields": fields}],
        })

    def upsert_matching(self, fields):
        """Write one EURES matching; never create Grist columns or tables."""
        table = self.MATCHINGS_TABLE
        besoin_id = str(fields.get("besoin_id") or "").strip()
        candidat_id = str(fields.get("candidat_id") or "").strip()
        if not besoin_id or not candidat_id:
            raise ValueError("Missing EURES matching pair identifiers")
        lock = self._pair_locks[hash((self.doc_id, besoin_id, candidat_id)) % len(self._pair_locks)]
        with lock:
            return self._upsert_matching_locked(fields, besoin_id, candidat_id)

    def _upsert_matching_locked(self, fields, besoin_id, candidat_id):
        table = self.MATCHINGS_TABLE
        prefix = f"tables/{table}"
        existing = self._request("GET", f"{prefix}/records", params={"filter": json.dumps({
            "besoin_id": [besoin_id], "candidat_id": [candidat_id],
        })}).get("records", [])
        if len(existing) > 1:
            raise GristUnavailable("Duplicate EURES matching pairs")
        from eures_matching import matching_workflow_status, initial_matching_workflow_status
        merged = dict(fields)
        merged["score"] = serialize_matching_score(fields.get("score"))
        if existing:
            old = existing[0].get("fields", {})
            merged["workflow_status"] = matching_workflow_status(old)
        else:
            merged["workflow_status"] = initial_matching_workflow_status(fields.get("statut", ""))
        columns = self._request("GET", f"{prefix}/columns").get("columns", [])
        allowed = {column.get("id") for column in columns if isinstance(column, dict)}
        score_column = next((column for column in columns
                             if isinstance(column, dict) and column.get("id") == "score"), None)
        if not score_column or score_column.get("fields", {}).get("type") != "Text":
            raise GristUnavailable("EURES Matchings.score must be a Text column")
        required = set(merged)
        if not required <= allowed:
            raise GristUnavailable("EURES Matchings table is missing required columns")
        if existing:
            if all(old.get(name) == value for name, value in merged.items()):
                return "unchanged"
            self._request("PATCH", f"{prefix}/records", json={"records": [{"id": existing[0]["id"], "fields": merged}]})
            return "updated"
        self._request("POST", f"{prefix}/records", json={"records": [{"fields": merged}]})
        return "created"

    def _request(self, method, path, **kwargs):
        if not self.doc_id or not self.api_key:
            raise GristUnavailable("EURES Grist configuration is incomplete")
        url = f"{self.base_url}/api/docs/{self.doc_id}/{path}"
        try:
            response = self.transport.request(
                method, url,
                headers={"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"},
                timeout=15, allow_redirects=False, **kwargs,
            )
        except requests.RequestException as exc:
            raise GristUnavailable("EURES Grist is unavailable") from exc
        if response.status_code != 200:
            raise GristUnavailable(f"EURES Grist returned HTTP {response.status_code}")
        return response.json()

    def save_response(self, role, fields):
        """Read schema/record, POST or PATCH one EURES record, then verify it.

        The only mutating request in this method is the POST or PATCH below.
        No FAGERH document or table can be selected through ``role``.
        """
        if role not in self.TABLES:
            raise ValueError("Unsupported EURES role")
        if any(name.startswith(("no_match_notification_", "new_job_request_",
                                "new_employer_alert_")) for name in fields):
            raise ValueError("Questionnaire cannot change EURES follow-up state")
        table = self.tables[role]
        if not table:
            raise GristUnavailable("EURES table is not configured")
        prefix = f"tables/{table}"
        columns = self._request("GET", f"{prefix}/columns").get("columns", [])
        allowed = {column.get("id") for column in columns if isinstance(column, dict)}
        # The employer table currently has id_tally but no uuid. Select the
        # record key from the actual EURES table schema before filtering fields.
        record_key = next((name for name in ("uuid", "id_tally")
                           if name in allowed and isinstance(fields.get(name), str)
                           and fields[name].strip()), None)
        if record_key is None:
            if not {"uuid", "id_tally"} & allowed:
                raise EuresIdentifierColumnsMissing("EURES table has neither uuid nor id_tally column")
            raise ValueError("A questionnaire identifier supported by the EURES table is required")
        record_value = fields[record_key]
        status_columns = {"response_status", "response_status_updated_at",
                          "response_status_updated_by", "response_received_at"}
        if not status_columns <= allowed:
            raise GristUnavailable("EURES response table is missing status columns")
        kept = {name: value for name, value in fields.items() if name in allowed}
        if not kept:
            raise ValueError("No compatible EURES fields")
        params = {"filter": json.dumps({record_key: [record_value]})}
        before = self._request("GET", f"{prefix}/records", params=params).get("records", [])
        if len(before) > 1:
            raise GristUnavailable("Duplicate EURES questionnaire identifiers")
        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        if before:
            old = before[0].get("fields", {})
            old_pair_id = str(old.get("id_tally") or old.get("uuid") or "").strip()
            new_pair_id = str(kept.get("id_tally", old.get("id_tally"))
                              or kept.get("uuid", old.get("uuid")) or "").strip()
            if old_pair_id and new_pair_id != old_pair_id:
                raise ValueError("EURES matching identity cannot change on retry")
            status = str(old.get("response_status") or "").strip().lower()
            kept["response_status"] = status if status in {"active", "disabled"} else "active"
            kept["response_status_updated_at"] = old.get("response_status_updated_at") or now_iso
            kept["response_status_updated_by"] = old.get("response_status_updated_by") or "system_questionnaire_submission"
            kept["response_received_at"] = (old.get("response_received_at") or old.get("tally_submitted_at")
                                            or old.get("created_at") or old.get("updated_at") or now_iso)
            if kept["response_status"] == "disabled":
                for name in ("response_disabled_at", "response_disabled_by", "response_disabled_reason"):
                    kept[name] = old.get(name) or ""
        else:
            kept.update(response_status="active", response_status_updated_at=now_iso,
                        response_status_updated_by="system_questionnaire_submission",
                        response_received_at=now_iso)
        kept = {name: value for name, value in kept.items() if name in allowed}
        try:
            if before:
                record_id = before[0]["id"]
                action = "updated"
                payload = {"records": [{"id": record_id, "fields": kept}]}
                self._request("PATCH", f"{prefix}/records", json=payload)
            else:
                action = "created"
                payload = {"records": [{"fields": kept}]}
                self._request("POST", f"{prefix}/records", json=payload)
            after = self._request("GET", f"{prefix}/records", params=params).get("records", [])
        except GristUnavailable as exc:
            raise EuresSaveUncertain("EURES response write outcome is uncertain") from exc
        if len(after) != 1 or after[0].get("fields", {}).get(record_key) != record_value:
            raise EuresSaveUncertain("EURES response could not be verified after write")
        return {"action": action, "record_id": after[0]["id"], "record_key": record_key,
                "saved_record": after[0]}

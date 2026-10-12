"""Administration V1 des utilisateurs EURES dans le document Grist dedie."""
from __future__ import annotations

import json
import re
import uuid

import requests

from eures_permissions import GRIST_DOCUMENT, GRIST_SERVER, normalize_email


USERS_TABLE = "Utilisateurs_Admin"
ROLES_TABLE = "Roles_Admin"
EDITABLE_FIELDS = ("Nom", "Fonction", "Email", "Telephone", "Institution", "Pays", "Role", "Actif")
TEXT_LIMITS = {"Nom": 200, "Fonction": 300, "Email": 320, "Telephone": 100,
               "Institution": 300, "Pays": 150, "Role": 150}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class DirectoryUnavailable(Exception):
    """Stable failure without upstream response bodies or credentials."""


class ValidationError(Exception):
    def __init__(self, code, field=""):
        super().__init__(code)
        self.code = code
        self.field = field


class ConflictError(Exception):
    pass


def _records(value, *, require_id=True):
    if not isinstance(value, list):
        raise DirectoryUnavailable("directory_unavailable")
    result = []
    for record in value:
        valid_id = type(record.get("id")) is int if isinstance(record, dict) else False
        if (not isinstance(record, dict) or (require_id and not valid_id)
                or not isinstance(record.get("fields"), dict)):
            raise DirectoryUnavailable("directory_unavailable")
        result.append(record)
    return result


def parse_permissions(role):
    try:
        permissions = json.loads(role["fields"]["Permissions"])
    except (KeyError, TypeError, ValueError):
        raise DirectoryUnavailable("directory_unavailable") from None
    if not isinstance(permissions, list) or any(not isinstance(item, str) for item in permissions):
        raise DirectoryUnavailable("directory_unavailable")
    return permissions


def public_role(record):
    fields = record["fields"]
    code = fields.get("Code")
    if not isinstance(code, str) or not code.strip():
        raise DirectoryUnavailable("directory_unavailable")
    label = fields.get("Libelle") or fields.get("Nom") or code
    if not isinstance(label, str):
        label = code
    return {"record_id": record["id"], "code": code, "nom": label,
            "permissions": parse_permissions(record)}


def role_map(roles):
    result = {}
    seen_ids = set()
    for record in _records(roles):
        role = public_role(record)
        if role["code"] in result or role["record_id"] in seen_ids:
            raise DirectoryUnavailable("directory_unavailable")
        result[role["code"]] = role
        seen_ids.add(role["record_id"])
    return result


def resolve_role_code(stored_value, roles_by_code):
    if type(stored_value) is int and stored_value > 0:
        matches = [role for role in roles_by_code.values()
                   if role["record_id"] == stored_value]
        if len(matches) == 1:
            return matches[0]["code"]
    elif isinstance(stored_value, str) and stored_value in roles_by_code:
        return stored_value
    raise DirectoryUnavailable("directory_unavailable")


def public_user(record, roles_by_code):
    fields = record["fields"]
    return {
        "record_id": record["id"],
        **{field: fields.get(field) for field in EDITABLE_FIELDS if field != "Role"},
        "Role": resolve_role_code(fields.get("Role"), roles_by_code),
        "Utilisateur_ID": fields.get("Utilisateur_ID"),
        "Version_session": fields.get("Version_session"),
        "Modifie_le": fields.get("Modifie_le"),
        "Modifie_par": fields.get("Modifie_par"),
    }


class GristAdminDirectory:
    """Fixed document and tables; no redirects and no schema mutations."""

    def __init__(self, config_provider, base_url_provider, get=None, post=None, patch=None):
        self.config_provider = config_provider
        self.base_url_provider = base_url_provider
        self.get = get or requests.get
        self.post = post or requests.post
        self.patch = patch or requests.patch

    def _headers(self):
        config = self.config_provider()
        if (self.base_url_provider().rstrip("/") != GRIST_SERVER
                or not config or not config.get("api_key")):
            raise DirectoryUnavailable("directory_unavailable")
        return {"Authorization": "Bearer " + config["api_key"]}

    def _url(self, table):
        if table not in {USERS_TABLE, ROLES_TABLE}:
            raise DirectoryUnavailable("directory_unavailable")
        return f"{GRIST_SERVER}/api/docs/{GRIST_DOCUMENT}/tables/{table}/records"

    def read(self):
        try:
            headers = self._headers()
            rows = []
            for table in (USERS_TABLE, ROLES_TABLE):
                response = self.get(self._url(table), headers=headers, timeout=10,
                                    allow_redirects=False)
                if response.status_code != 200:
                    raise DirectoryUnavailable("directory_unavailable")
                rows.append(_records(response.json().get("records")))
            return tuple(rows)
        except DirectoryUnavailable:
            raise
        except Exception:
            raise DirectoryUnavailable("directory_unavailable") from None

    def create_user(self, fields):
        try:
            response = self.post(self._url(USERS_TABLE), headers=self._headers(), timeout=10,
                allow_redirects=False, json={"records": [{"fields": fields}]})
            if response.status_code not in {200, 201}:
                raise DirectoryUnavailable("directory_unavailable")
            records = response.json().get("records")
            if (not isinstance(records, list) or len(records) != 1
                    or not isinstance(records[0], dict) or type(records[0].get("id")) is not int):
                raise DirectoryUnavailable("directory_unavailable")
            return {"id": records[0]["id"], "fields": dict(fields)}
        except DirectoryUnavailable:
            raise
        except Exception:
            raise DirectoryUnavailable("directory_unavailable") from None

    def update_user(self, record_id, fields):
        try:
            response = self.patch(self._url(USERS_TABLE), headers=self._headers(), timeout=10,
                allow_redirects=False,
                json={"records": [{"id": record_id, "fields": fields}]})
            if response.status_code not in {200, 201}:
                raise DirectoryUnavailable("directory_unavailable")
        except DirectoryUnavailable:
            raise
        except Exception:
            raise DirectoryUnavailable("directory_unavailable") from None


def validate_fields(payload, *, creation):
    if not isinstance(payload, dict):
        raise ValidationError("invalid_payload")
    unknown = set(payload) - set(EDITABLE_FIELDS) - {"expected_version"}
    if unknown:
        raise ValidationError("unknown_field", sorted(unknown)[0])
    result = {}
    for field in EDITABLE_FIELDS:
        if field not in payload:
            if creation and field in {"Nom", "Email", "Role"}:
                raise ValidationError("required", field)
            continue
        value = payload[field]
        if field == "Actif":
            if type(value) is not bool:
                raise ValidationError("invalid_boolean", field)
            result[field] = value
            continue
        if not isinstance(value, str):
            raise ValidationError("invalid_text", field)
        value = value.strip() if field != "Telephone" else value
        if len(value) > TEXT_LIMITS[field]:
            raise ValidationError("too_long", field)
        if field in {"Nom", "Email", "Role"} and not value:
            raise ValidationError("required", field)
        result[field] = normalize_email(value) if field == "Email" else value
    if "Email" in result and not EMAIL_RE.fullmatch(result["Email"]):
        raise ValidationError("invalid_email", "Email")
    return result


def ensure_unique_email(users, email, ignored_record_id=None):
    matches = [record for record in users if record["id"] != ignored_record_id
               and normalize_email(record["fields"].get("Email")) == normalize_email(email)]
    if matches:
        raise ConflictError("email_already_exists")


def new_user_fields(payload, users, roles):
    fields = validate_fields(payload, creation=True)
    roles_by_code = role_map(roles)
    role = roles_by_code.get(fields["Role"])
    if role is None:
        raise ValidationError("unknown_role", "Role")
    ensure_unique_email(_records(users), fields["Email"])
    fields["Role"] = role["record_id"]
    fields["Utilisateur_ID"] = "usr_" + uuid.uuid4().hex
    fields["Actif"] = True
    fields["Version_session"] = 1
    return fields


def plan_update(payload, users, roles, record_id, actor_user_id):
    users = _records(users)
    current = next((record for record in users if record["id"] == record_id), None)
    if current is None:
        raise ValidationError("not_found")
    expected = payload.get("expected_version") if isinstance(payload, dict) else None
    version = current["fields"].get("Version_session")
    if type(expected) is not int or expected != version:
        raise ConflictError("stale_record")
    changes = validate_fields(payload, creation=False)
    roles_by_code = role_map(roles)
    if "Role" in changes:
        role = roles_by_code.get(changes["Role"])
        if role is None:
            raise ValidationError("unknown_role", "Role")
        changes["Role"] = role["record_id"]
    current_role_code = resolve_role_code(current["fields"].get("Role"), roles_by_code)
    if "Email" in changes:
        ensure_unique_email(users, changes["Email"], record_id)
    next_active = changes.get("Actif", current["fields"].get("Actif"))
    target_user_id = current["fields"].get("Utilisateur_ID")
    if target_user_id == actor_user_id and next_active is False:
        raise ConflictError("self_deactivation_forbidden")

    def is_active_admin(record, override=False):
        fields = dict(record["fields"])
        if override:
            fields.update(changes)
        code = resolve_role_code(fields.get("Role"), roles_by_code)
        return (fields.get("Actif") is True
                and "admin.users" in roles_by_code[code]["permissions"])

    if sum(is_active_admin(record, record["id"] == record_id) for record in users) < 1:
        raise ConflictError("last_active_admin")
    actual = {field: value for field, value in changes.items()
              if current["fields"].get(field) != value}
    role_changed = ("Role" in actual and
                    resolve_role_code(actual["Role"], roles_by_code) != current_role_code)
    if "Role" in actual and not role_changed:
        actual.pop("Role")
    sensitive = role_changed or "Actif" in actual
    if sensitive:
        if type(version) is not int or version < 1:
            raise DirectoryUnavailable("directory_unavailable")
        actual["Version_session"] = version + 1
    actions = ["modify"] if actual else []
    if role_changed:
        actions.append("role_change")
    if "Actif" in actual:
        actions.append("status_change")
    return current, actual, actions

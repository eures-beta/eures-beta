"""Phase 1: explicit, read-only authorization. No route hooks or shared cache."""
import json
from dataclasses import dataclass

import requests

GRIST_SERVER = 'https://grist.numerique.gouv.fr'
GRIST_DOCUMENT = 'a9T1veaFas9u'
KNOWN_PERMISSIONS = frozenset({
    'candidats.read', 'candidats.write', 'candidats.delete', 'candidats.cv.read',
    'employeurs.read', 'employeurs.write', 'employeurs.delete',
    'matchings.read', 'matchings.write', 'invitations.read', 'invitations.write',
    'communications.send', 'communications.test', 'suivi.read', 'suivi.write',
    'documentation.read', 'documentation.write', 'reseau.read', 'reseau.write',
    'statistiques.read', 'systeme.read', 'audit.read', 'admin.users',
})


def normalize_email(value):
    return value.strip().casefold() if isinstance(value, str) else ''


@dataclass(frozen=True)
class Authorization:
    reason: str
    user_id: str = ''
    permissions: frozenset = frozenset()
    role_code: str = ''

    def has_permission(self, permission):
        return (self.reason == 'authorized' and isinstance(permission, str)
                and permission in KNOWN_PERMISSIONS and permission in self.permissions)


class PermissionDenied(Exception):
    """Stable diagnostic only: never include upstream bodies or credentials."""


class GristUnavailable(Exception):
    pass


def _fields(records):
    if not isinstance(records, list):
        raise ValueError('invalid_records')
    result = []
    for record in records:
        if not isinstance(record, dict) or not isinstance(record.get('fields'), dict):
            raise ValueError('invalid_records')
        result.append(record['fields'])
    return result


def _resolve_role(role_value, roles_raw):
    """Resolve a Grist Ref row id, with temporary legacy text-code support."""
    if type(role_value) is int and role_value > 0:
        matches = [record for record in roles_raw if record.get('id') == role_value]
    elif isinstance(role_value, str) and role_value.strip():
        matches = [record for record in roles_raw
                   if isinstance(record.get('fields'), dict)
                   and record['fields'].get('Code') == role_value]
    else:
        return None, 'role_invalid'
    if len(matches) != 1:
        return None, 'role_absent' if not matches else 'role_duplicate'
    role = matches[0].get('fields')
    if not isinstance(role, dict):
        return None, 'role_invalid'
    code = role.get('Code')
    if not isinstance(code, str) or not code.strip():
        return None, 'role_invalid'
    if sum(isinstance(record.get('fields'), dict)
           and record['fields'].get('Code') == code for record in roles_raw) != 1:
        return None, 'role_duplicate'
    return role, ''


class GristAuthorizationReader:
    """Reuse the app config provider; never persist or log its credential.

    Fixed document/tables, GET only, no redirects, no schema creation helpers.
    Configuration is resolved afresh on every call.
    """
    def __init__(self, config_provider, base_url_provider, get=None):
        self.config_provider = config_provider
        self.base_url_provider = base_url_provider
        self.get = get or requests.get

    def __call__(self):
        try:
            config = self.config_provider()
            if (self.base_url_provider().rstrip('/') != GRIST_SERVER
                    or not config or not config.get('api_key')):
                raise GristUnavailable()
            rows = []
            for table in ('Utilisateurs_Admin', 'Roles_Admin'):
                response = self.get(
                    f'{GRIST_SERVER}/api/docs/{GRIST_DOCUMENT}/tables/{table}/records',
                    headers={'Authorization': 'Bearer ' + config['api_key']},
                    timeout=10, allow_redirects=False,
                )
                if response.status_code != 200:
                    raise GristUnavailable()
                rows.append(response.json()['records'])
            return tuple(rows)
        except Exception:
            raise GristUnavailable('grist_unavailable') from None


def resolve_authorization(personal_session, reader):
    """personal_session must come from the existing validated signed session.

    Missing version is denied, never silently upgraded to the current Grist
    version. Basic credentials and recovery email aliases are not identities.
    """
    if not isinstance(personal_session, dict):
        return Authorization('personal_session_required')
    email = normalize_email(personal_session.get('email'))
    if not email:
        return Authorization('personal_session_required')
    version = personal_session.get('Version_session')
    if type(version) is not int or version < 1:
        return Authorization('session_version_invalid')
    try:
        users_raw, roles_raw = reader()
        users = _fields(users_raw)
        _fields(roles_raw)
    except Exception:
        return Authorization('grist_unavailable')
    matches = [u for u in users if normalize_email(u.get('Email')) == email]
    if len(matches) != 1:
        return Authorization('user_absent' if not matches else 'user_duplicate')
    user = matches[0]
    if user.get('Actif') is not True:
        return Authorization('user_inactive')
    user_id = user.get('Utilisateur_ID')
    if not isinstance(user_id, str) or not user_id.strip():
        return Authorization('user_id_invalid')
    if sum(u.get('Utilisateur_ID') == user_id for u in users) != 1:
        return Authorization('user_id_duplicate')
    if type(user.get('Version_session')) is not int or user['Version_session'] != version:
        return Authorization('session_version_invalid')
    role, role_error = _resolve_role(user.get('Role'), roles_raw)
    if role_error:
        return Authorization(role_error)
    role_code = role['Code']
    try:
        permissions = json.loads(role['Permissions'])
        if not isinstance(permissions, list) or any(not isinstance(p, str) for p in permissions):
            return Authorization('permissions_invalid')
        if any('*' in p for p in permissions):
            return Authorization('wildcard_forbidden')
        if any(p not in KNOWN_PERMISSIONS for p in permissions):
            return Authorization('permission_unknown')
    except (KeyError, ValueError, TypeError):
        return Authorization('permissions_invalid')
    return Authorization('authorized', user_id, frozenset(permissions), role_code)


def has_permission(permission, personal_session, reader):
    if not isinstance(permission, str) or permission not in KNOWN_PERMISSIONS:
        return False
    return resolve_authorization(personal_session, reader).has_permission(permission)


def require_permission(permission, personal_session, reader):
    """Future enforcement primitive. Not attached to any Phase 1 route."""
    if not isinstance(permission, str) or permission not in KNOWN_PERMISSIONS:
        raise PermissionDenied('permission_unknown')
    authorization = resolve_authorization(personal_session, reader)
    if not authorization.has_permission(permission):
        raise PermissionDenied(authorization.reason if authorization.reason != 'authorized'
                               else 'permission_denied')
    return authorization


def issue_session_version(validated_email, reader):
    """Only called after personal authentication; never takes a client version.

    Validate the complete authorization against the same read snapshot.
    Failure leaves the transitional legacy session unversioned.
    """
    email = normalize_email(validated_email)
    if not email:
        return None
    try:
        snapshot = reader()
        users = _fields(snapshot[0])
        matches = [u for u in users if normalize_email(u.get('Email')) == email]
        if len(matches) != 1:
            return None
        version = matches[0].get('Version_session')
        result = resolve_authorization(
            {'email': email, 'Version_session': version}, lambda: snapshot)
        return version if result.reason == 'authorized' else None
    except Exception:
        return None

"""Process-wide outbound request boundary for the dedicated FT candidate."""
import os
import re
from urllib.parse import urlsplit
import requests


class ExternalAccessDisabled(requests.RequestException):
    pass


def permitted(method, url, environment=None):
    env = os.environ if environment is None else environment
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
        return False
    mode = env.get('EURES_DATA_MODE', 'offline')
    base = urlsplit(env.get('GRIST_BASE_URL', 'https://grist.numerique.gouv.fr'))
    docs = {value for key, value in env.items() if key.startswith('GRIST_DOC_EURES_') and value}
    match = re.match(r'^/api/docs/([^/]+)(?:/|$)', parsed.path)
    if parsed.hostname == base.hostname and match and match.group(1) in docs:
        return mode == 'write' or (mode == 'read-only' and method.upper() in {'GET', 'HEAD'})
    if parsed.hostname == 'api.brevo.com':
        return mode == 'write' and env.get('EURES_EMAIL_MODE', 'off') == 'send' and (
            (method.upper() == 'GET' and parsed.path == '/v3/account') or
            (method.upper() == 'POST' and parsed.path == '/v3/smtp/email'))
    return False


def install():
    if getattr(requests.sessions.Session.send, '_ft_guard', False):
        return
    original_send = requests.sessions.Session.send

    def guarded_send(session, prepared, **kwargs):
        if not permitted(prepared.method, prepared.url):
            raise ExternalAccessDisabled('External operation disabled by FT migration configuration')
        kwargs['allow_redirects'] = False
        if kwargs.get('timeout') is None:
            kwargs['timeout'] = (5, 30)
        response = original_send(session, prepared, **kwargs)
        if 300 <= response.status_code < 400:
            response.close()
            raise ExternalAccessDisabled('External redirect refused')
        return response

    guarded_send._ft_guard = True
    requests.sessions.Session.send = guarded_send

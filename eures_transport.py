"""Network policy for production transports; injected test doubles stay offline."""
import requests


class EuresTransport:
    def __init__(self, config, session=None):
        self.mode = str(config.get("EURES_DATA_MODE", "offline")).strip().lower()
        self.session = session if session is not None else requests.Session()

    def request(self, method, url, **kwargs):
        if self.mode not in {"read-only", "write"}:
            raise requests.RequestException("EURES external data access disabled")
        if self.mode != "write" and method.upper() not in {"GET", "HEAD"}:
            raise requests.RequestException("EURES data writes disabled")
        return self.session.request(method, url, **kwargs)

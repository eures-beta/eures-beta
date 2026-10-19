import os
from pathlib import Path
import shlex
import subprocess
import sys
import unittest
from unittest.mock import patch
from gunicorn.app.wsgiapp import WSGIApplication


class WorkerConfigTest(unittest.TestCase):
    def config(self, **env):
        command = (Path(__file__).resolve().parents[1] / 'Procfile').read_text().strip().removeprefix('web: ')
        # Expand only the controlled shell variables from the actual Procfile, without starting a server.
        script = 'set -- ' + command + '; printf "%s\\n" "$@"'
        args = subprocess.check_output(['bash', '-c', script], env={**os.environ, 'PORT': '8000', **env}, text=True).splitlines()
        with patch.object(sys, 'argv', args):
            return WSGIApplication().cfg

    def test_environment_cannot_accidentally_enable_multiple_workers(self):
        cfg = self.config(WEB_CONCURRENCY='8')
        self.assertEqual(cfg.workers, 1)
        self.assertEqual(cfg.threads, 1)
        self.assertEqual(cfg.worker_class_str, 'sync')
        self.assertEqual(cfg.timeout, 30)
        self.assertEqual(cfg.max_requests, 0)
        self.assertEqual(cfg.max_requests_jitter, 0)

    def test_timeout_is_explicitly_configurable(self):
        self.assertEqual(self.config(GUNICORN_TIMEOUT='45').timeout, 45)

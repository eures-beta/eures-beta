"""Run the reconciled EURES tests with external connections and dotenv disabled."""
import os
from pathlib import Path
import socket
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))
os.environ['PYTHON_DOTENV_DISABLED'] = '1'
for key in list(os.environ):
    if key.startswith(('GRIST_', 'BREVO_', 'OPENAI_', 'ADMIN_', 'SESSION_', 'FLASK_', 'EURES_')) or key == 'APP_MODE':
        del os.environ[key]
os.environ['SESSION_SECRET'] = 'offline-tests-only'
os.environ['EURES_EMAIL_ACTION_SECRET'] = 'offline-email-tests-only'


def block_network(*args, **kwargs):
    raise AssertionError('External network disabled during reconciliation tests')


socket.create_connection = block_network
socket.socket.connect = block_network
# Independent unit cases must not share a production rate-limit window.
# Dedicated rate-limit regression cases explicitly enable and reset the limiter.
import app
app.limiter.enabled = False
result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover('tests'))
raise SystemExit(not result.wasSuccessful())

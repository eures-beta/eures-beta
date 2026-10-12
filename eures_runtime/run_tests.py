import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

root = Path(__file__).parent
sys.path.insert(0, str(root.resolve()))
with patch.dict(os.environ, {'PATH':os.environ.get('PATH',''), 'APP_MODE':'eures-beta', 'EURES_EMAIL_ACTION_SECRET':'fictional-test-action-secret'}, clear=True), patch('socket.socket.connect', side_effect=AssertionError('Real network forbidden')), patch('socket.create_connection', side_effect=AssertionError('Real network forbidden')):
    suite = unittest.TestLoader().discover(str(root / 'tests'))
    result = unittest.TextTestRunner(verbosity=1).run(suite)
raise SystemExit(0 if result.wasSuccessful() else 1)

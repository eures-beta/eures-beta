web: gunicorn app:app --bind 0.0.0.0:$PORT --worker-class sync --workers 1 --threads 1 --timeout ${GUNICORN_TIMEOUT:-30} --max-requests 1000 --max-requests-jitter 100

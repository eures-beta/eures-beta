# Commandes locales Flask/Grist ; aucun déploiement ni accès FT dans ce dépôt public.
.DEFAULT_GOAL := help
# Outillage isolé des dépendances de l'application et des identifiants personnels.
QUALITY_PYTHON ?= .venv-quality/bin/python

.PHONY: install-quality format format-check
install-quality: ## Installer Black dans un environnement dédié (Python 3.12)
	python3.12 -m venv .venv-quality
	.venv-quality/bin/python -m pip install -r requirements-quality.txt

format: ## Formater les fichiers Python avec Black (modifie les fichiers)
	$(QUALITY_PYTHON) -m black --no-cache .

format-check: ## Vérifier le formatage sans modifier les fichiers
	$(QUALITY_PYTHON) -m black --check --diff --no-cache .
UV ?= uv
HOST ?= 127.0.0.1
PORT ?= 5005
TEST_ARGS ?=

.PHONY: help install run test test-js
help: ## Afficher les commandes disponibles
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf '\nParamètres : UV, HOST, PORT, TEST_ARGS (ex. -v).\n'

install: ## Installer les dépendances verrouillées dans uv.lock
	$(UV) sync --locked

run: ## Démarrer Flask sur loopback ; .env doit utiliser des services de test
	$(UV) run --locked flask --app app.py run --host "$(HOST)" --port "$(PORT)"

test: ## Exécuter la suite Python (mocks des services externes)
	PUBLIC_APP_BASE_URL=https://example.test \
	SESSION_SECRET=fictional-session-secret-for-local-tests \
	EURES_EMAIL_ACTION_SECRET=fictional-email-action-secret-for-local-tests \
	EURES_PUBLIC_WRITE_SECRET=fictional-public-write-secret-for-local-tests \
	EURES_VISIT_ANALYTICS_ENABLED=false \
	$(UV) run --locked python -B -m unittest discover -s tests -p 'test_*.py' $(TEST_ARGS)

test-js: ## Tester le JavaScript de l'administration (Node.js requis)
	node --test tests/admin_loading.test.cjs

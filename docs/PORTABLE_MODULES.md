# Modules Grist portables

Ces cinq modules complètent la source Flask historique sans recopier l’application,
les pages ou la configuration d’un hébergeur. Ils sont repris du commit
`ef7e067db26eccda53c0dc15c963c57cd9d0830f`, avec le test de workflow associé.

- `eures_transport.py` : frontière des lectures et écritures selon le mode configuré.
- `eures_grist.py` : accès aux tables EURES et enregistrement des matchings.
- `eures_public_stats.py` : projection minimisée des statistiques.
- `eures_score_storage.py` : contrat explicite du score stocké en texte, de 0 à 100.
- `eures_matching.py` : états de workflow et conservation des décisions humaines.

`EuresGrist` utilise `GRIST_BASE_URL`, `GRIST_DOC_EURES_BETA` et
`GRIST_API_KEY_EURES_BETA`, ainsi que les éventuelles variables de tables.
Sans mode `read-only` ou `write`, son transport refuse les appels externes.
Le mode `read-only` refuse les écritures. Les tests injectent un transport fictif.

Cette intégration ne modifie ni `app.py`, ni les pages, ni les dépendances,
ni les règles de matching existantes. Les procédures d’hébergement et secrets
restent dans les dépôts privés. Une fusion ne déclenche aucun déploiement.

Le test `tests/test_portable_matching_workflow.py` vérifie notamment qu’un
recalcul conserve un refus humain et qu’un nouveau matching attend une validation.

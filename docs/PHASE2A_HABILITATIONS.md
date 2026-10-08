# Phase 2A — sas d’habilitations, 9 septembre 2026

> Note historique conservée pour expliquer la phase. Les résultats ci-dessous concernent
> les travaux antérieurs dans les deux dépôts, pas le présent lot isolé. Pour ce lot
> historique Phase 1 + 2A, le rapport de validation livré séparément fait référence.
> Réseau et le dépôt dédié ne font pas partie du lot.

Implémentation locale dans les deux dépôts. Aucun déploiement. Arrêt avant Phase 2B.

## Flux inspecté et point d’émission

Les deux applications vérifient le mode de connexion, la signature et l’expiration
du magic-link, son formulaire, l’email dans la liste autorisée et son identifiant
à usage unique. Le dépôt dédié vérifie également que le formulaire est actif et
expose aussi l’alias /magic. Le seul appel applicatif à _set_admin_session est
situé après ces vérifications. La session personnelle existante est ensuite
validée par email autorisé et durée de vie ; Basic reste indépendant.

L’émission ajoutée est limitée au callback EURES après ces validations :
issue_session_version lit les deux tables du document Habilitations via le lecteur
existant, puis vérifie utilisateur unique, actif, identifiant cohérent, version
entière positive, rôle unique et permissions explicites valides sur ce même jeu
de données. Elle inscrit uniquement la version issue de Grist dans la session
Flask signée. Aucune version du jeton ou des paramètres HTTP n’est utilisée.
Le résultat Authorization expose aussi role_code pour vérifier le rôle résolu.

## Transition volontairement non bloquante

Une connexion personnelle authentifiée mais sans habilitation valide, ou avec
Grist indisponible, ouvre uniquement une session historique sans Version_session.
Une nouvelle connexion remplace l’ancienne session : aucune ancienne version
n’est conservée en cas d’échec. Les sessions anciennes ne sont jamais mises à
niveau lors d’une simple lecture ou d’un contrôle d’autorisation.

Le moteur refuse toute session sans version ou avec version incorrecte. Il relit
Grist à chaque contrôle : désactivation et incrément invalident immédiatement
l’autorisation lors du contrôle suivant. Les routes non migrées conservent leurs
contrôles actuels ; une révocation ne bloque donc PAS encore l’ensemble de l’admin.
C’est la limite explicite de Phase 2A, et non une protection complète des routes.
Basic est conservé. Aucun changement des parcours autres qu’EURES.

## Adaptation HTTP préparée

eures_permission_http_response(permission) renvoie None si autorisé, sinon une
réponse JSON générique 403 (Access denied), ou 503 (Authorization unavailable)
si le moteur signale une indisponibilité technique de Grist. Aucun diagnostic
nominatif ni indication d’existence d’un utilisateur n’est exposé. Cette fonction
n’est branchée à aucune route métier. Le callback reste en transition non bloquante.

## Vérification locale du dépôt dédié

Import et résolution de configuration exécutés avec son propre .venv et depuis
son propre dossier, via le chargement dotenv et get_form_config existants.
GRIST_BASE_URL correspond au serveur attendu, mais les variables suivantes sont
absentes de l’environnement chargé : GRIST_DOC_EURES_BETA_CANDIDATE,
GRIST_DOC_EURES_BETA, GRIST_API_KEY_EURES_BETA_CANDIDATE,
GRIST_API_KEY_EURES_BETA et GRIST_API_KEY. get_form_config renvoie None.
Le mode local est basic ; l’email FT n’est pas dans la liste locale autorisée.
Il est donc impossible de valider ici un accès Grist réel propre au dépôt dédié
ou une connexion FT réelle. Aucun secret copié, aucune clé créée, aucune
configuration modifiée. Aucun appel distant nécessaire aux tests simulés.

## Tests et vérification

Dépôt historique : 58 tests test_eures*.py réussis + 7 tests Réseau réussis.
Dépôt dédié : 45 tests test_eures*.py réussis + 7 tests Réseau réussis.
Total : 117 tests réussis, dont 14 nouveaux tests Phase 2A (7 par dépôt).

Couverture : callback réellement signé avec lecteur Grist simulé ; identité
principale admin@example.test → administrateur / Administrateur →
22 permissions listées explicitement dans la fixture ; version client ignorée ;
version 1 valide ; incrément ; ancienne session non mise à niveau ; utilisateur
inactif ; incohérence utilisateur/rôle ; doublon ; source indisponible ; signature
invalide ; rejeu ; réponses 403/503 ; accès historiques Basic/personnel conservés.
L’adresse candidate@example.test est testée comme non-alias, sans second compte.
Aucune nouvelle dépendance à l’adresse abandonnée n’a été introduite (diff vérifié).
Des avertissements existants de configuration analytics et de fichiers non fermés
apparaissent dans la suite historique, sans échec ; aucun changement hors périmètre.

## Fichiers de cette phase, dans chacun des deux dépôts

- app.py : émission dans le callback EURES et adaptateur HTTP central non branché.
- eures_permissions.py : émission contrôlée et rôle dans le résultat.
- tests/test_eures_phase2a.py : nouveau fichier de tests.
- docs/PHASE2A_HABILITATIONS.md : présent bilan technique.

Les fichiers et changements préexistants, notamment Réseau, README, templates et
Phase 1, sont conservés. Aucun compte, partage ou donnée Grist modifié.

## Limites restantes avant toute activation ultérieure

La connexion FT réelle et les données Grist actuelles ne sont pas démontrées par
les fixtures. La configuration dédiée doit être disponible et vérifiée avant
déploiement. Aucun alias automatique ou mécanisme de récupération ajouté.
Les deux lectures Grist restent non atomiques et peuvent prendre jusqu’à deux
délais de 10 secondes à la connexion. La protection des routes, la suppression du
Basic et les autres chantiers sécurité restent hors de cette phase.

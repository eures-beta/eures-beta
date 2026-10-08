# Habilitations Match Europe — Phase 1

> Note historique conservée pour expliquer la phase. Les résultats ci-dessous concernent
> les travaux antérieurs dans les deux dépôts, pas le présent lot isolé. Pour ce lot
> historique Phase 1 + 2A, le rapport de validation livré séparément fait référence.
> Réseau et le dépôt dédié ne font pas partie du lot.

Le moteur est disponible à la demande dans `app.py` :
`get_eures_authorization()`, `has_permission(permission)` et
`require_permission(permission)`. Aucun appel automatique, décorateur de route,
hook Flask ou changement d'authentification n'est ajouté.

`eures_permissions.py` sépare la résolution pure, le résultat immuable et le
lecteur Grist. Ce dernier reprend `get_form_config('eures-beta', 'candidate')`
puis le formulaire EURES par défaut, sans nouvelle clé ni copie persistante.
Le serveur est vérifié strictement et le document fixé à `a9T1veaFas9u`.
Seuls deux GET sur `Utilisateurs_Admin` et `Roles_Admin` sont utilisés, sans
redirection ni helper susceptible de créer des tables. Aucun cache, même local
à la requête. Un appel au moteur peut attendre deux délais réseau de 10 secondes.
Les erreurs remontent sous forme de codes fixes, sans réponse Grist ni secret.

Schéma vérifié en lecture seule le 9 septembre 2026 : `Email`,
`Utilisateur_ID`, `Actif` booléen, `Role` texte référençant `Roles_Admin.Code`,
`Version_session` entier ; `Permissions` est du texte contenant un tableau JSON.
Le catalogue fermé contient les 22 permissions actuellement validées. Ajouter
une permission demandera une modification explicite du catalogue et des tests.
Un rôle qui contient une permission inconnue ou un joker est refusé entièrement.

L'identité vient exclusivement de la session personnelle validée par le
mécanisme actuel. Basic ne fournit aucune identité au nouveau moteur.
La session doit porter `Version_session`, entier positif identique à Grist.
Les sessions actuelles n'émettent pas encore ce champ : elles sont refusées
logiquement par le moteur mais continuent d'accéder à l'admin actuel.
`require_permission` lève `PermissionDenied` ; aucune route ne l'utilise encore.

Identité principale décidée : admin@example.test.
Secours/récupération : candidate@example.test, sans alias automatique ni second
utilisateur. Aucune exception nominative dans le code et aucun mécanisme de
récupération ajouté. Aucune donnée Grist modifiée.

Avant Phase 2 : définir l'émission de la version à la connexion personnelle,
traiter les sessions existantes, tester une connexion FT réelle, mapper les
refus aux réponses HTTP et appliquer la matrice de permissions aux routes.
La validation personnelle conserve pour l'instant la liste d'emails autorisés
actuelle. Les deux lectures Grist ne constituent pas une transaction atomique.
L'accès distant a été vérifié avec la configuration du dépôt historique ; le
dépôt dédié devra disposer de sa configuration EURES habituelle à l'exécution,
sans transfert de secret entre dépôts.

Aucun déploiement ni changement de partage, données métier, Basic, parcours
publics, Réseau, FAGERH, CSRF ou GET existants. Arrêt avant Phase 2.

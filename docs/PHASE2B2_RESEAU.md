# Phase 2B.2 — Réseau : création et modification

Lot préparé depuis `0d5fabd6de56c8c17c717776ba0cd3f27de2ffb0`.
Aucun commit, push, déploiement, contact distant ou changement de configuration.
La copie indépendante conserve le dépôt de travail historique intact.

## Accès

| Surface | Autorisation serveur |
| --- | --- |
| Page, liste, fiche, capacité | `reseau.read` |
| Métadonnées du formulaire, création, modification | `reseau.read` ET `reseau.write` |

`reseau.write` est ajouté au catalogue Python, sans implication de lecture.
Les formulaires nécessitent les deux droits car ils permettent de consulter la
fiche et les informations de suivi. Un compte avec `write` seul est refusé sur
toutes ces surfaces ; aucun droit n'est ajouté à sa session.

Les nouvelles routes résolvent chaque requête sur un instantané frais des deux
tables Habilitations, sans cache. Session personnelle, version, activité, rôle et
permissions sont contrôlés avant tout accès aux contacts. Basic, fallback admin,
version invalide ou permission absente : 403. Source Habilitations inaccessible :
503. La liste des propriétaires provient du même instantané que l'autorisation.

## Écriture et validation

- `POST /api/forms/eures-beta/admin/reseau/contacts` : création.
- `PATCH /api/forms/eures-beta/admin/reseau/contacts/<id>` : modification partielle.
- `GET /api/forms/eures-beta/admin/reseau/editor` : choix, propriétaires et CSRF.
- Pas de PUT, DELETE, export ou suppression physique ajouté.
- Destination fixée au document métier `dPYCS1LhDd8Q`, table
  `Contacts_Initiative`. Aucun helper de création de schéma ni proxy de mutation.
- Seuls les 16 champs métier prévus, puis `Actif` en édition, sont acceptés.
  Champs inconnus, `Contact_ID` client et `Actif` client en création : 400.
- Identité minimale après trim : prénom, nom ou organisation.
- Choix lus dans les métadonnées Grist à chaque ouverture/enregistrement ; les
  trois Choice sont validés côté serveur. Type et source peuvent rester vides.
- Les 18 types de colonnes et l'absence de formules sont vérifiés avant écriture.
  Schéma incompatible : 503, aucune migration tentée. Le relevé du 9 septembre
  fourni dans la conversation indique Text, Choice, Date et Bool compatibles ;
  aucune nouvelle lecture distante n'a été nécessaire à cette préparation.
- Dates reçues en AAAA-MM-JJ, calendrier vérifié, stockage en secondes UTC Grist.
  Une date inconnue reste vide ; aucun horodatage métier inventé.
- Limites : prénom/nom 200, organisation/fonction/introduit par 300, pays 100,
  email 254, téléphone 50, notes 10 000 caractères ; corps JSON de 64 Kio maximum.
  Contrôle syntaxique email et téléphone, sans vérification de délivrabilité ni
  normalisation destructive des numéros. Coordonnées facultatives.
- Création : `Actif=true`, `Newsletter_statut=Non sollicité`, date de consentement
  vide sauf saisie. `Accepté` exige une date renseignée ou déjà connue dans la
  fiche. Cette date seule n'est pas une preuve juridique du consentement.
- L'interface PATCH uniquement les champs effectivement changés. Les autres
  champs distants restent inchangés. `Actif=false` permet la désactivation.

## Identifiants et propriétaires

`Contact_ID = CI-<UUID4>` : 122 bits aléatoires, aucune donnée personnelle,
génération serveur seulement et identifiant conservé en édition. La liste des
identifiants existants est comparée avant POST, avec cinq essais maximum. Les
tests forcent collision puis réussite, et cinq collisions entraînant un refus.

Il n'y a pas de contrainte d'unicité atomique Grist dans ce lot : deux processus
générant simultanément le même UUID ne sont pas départagés par la vérification
préalable. Ce risque aléatoire est extrêmement faible mais non nul. Le plafond
historique de 5 000 contacts demeure ; au-delà, le contrôle échoue fermé.

`Proprietaire_contact` conserve son type Text et stocke exactement
`Utilisateur_ID`, déjà utilisé comme identifiant stable par le moteur central.
La liste propose uniquement les utilisateurs `Actif=true`, avec prénom/nom ou
email en libellé. L'utilisateur connecté est sélectionné par défaut en création.
Une valeur nouvelle doit être dans ce catalogue. Un catalogue ambigu/invalide
est refusé ; aucun texte libre n'est accepté pour une nouvelle attribution.

En édition, une valeur ancienne sans correspondance active reste proposée comme
« Valeur antérieure conservée », et peut être conservée ou remplacée explicitement
par un utilisateur actif. Elle n'est ni normalisée ni effacée silencieusement.
La fiche de lecture résout uniquement le libellé de son propriétaire, sans livrer
la liste des utilisateurs aux lecteurs ; une ancienne valeur demeure lisible.

## CSRF et audit

Jeton aléatoire de 32 octets dans la session Flask signée, obtenu par le formulaire
autorisé puis envoyé dans `X-Network-CSRF`. Comparaison constante côté serveur,
POST/PATCH JSON uniquement, absence ou mauvais jeton : 403. La protection est
limitée aux mutations Réseau ; ce lot ne modifie pas les autres routes admin.
Les permissions/version restent vérifiées même avec un jeton valide.

Les réponses Réseau gardent `no-store, private`, `no-referrer` et `nosniff`.
Les libellés, erreurs et valeurs sont insérés avec `textContent`/`value`.

Audit après écriture confirmée : identité personnelle de l'acteur, create/update,
cible (Contact_ID généré en création, id de ligne en édition), horodatage UTC,
noms des champs modifiés. Aucune coordonnée de contact, note, valeur avant/après,
cookie, jeton ou réponse Grist dans les logs. L'identité de l'acteur est la seule
donnée personnelle nécessaire à cet audit nominatif.

## Validation et limites opérationnelles

92 tests réussis : 25 Réseau, 59 EURES et 8 magic-link. Les appels externes non
simulés sont interdits pendant la suite finale. Couverture : validations, valeurs
par défaut, propriétaire actif/ancien, collisions, édition, désactivation,
matrice d'accès, sessions, CSRF, transport borné, schéma, audit et routes existantes.

Les tests historiques qui considéraient `reseau.write` inconnu ont été adaptés
à une permission réellement inconnue. La fixture Phase 2A garde ses 22 droits :
un test confirme que l'ajout au catalogue n'accorde pas `reseau.write` au rôle.
Sans identifiants FAGERH fictifs, un test employeurs échoue également sur le SHA
initial (503 au lieu de 401/404). Avec ces identifiants locaux, les 59 tests passent.
Les avertissements historiques de configuration analytics et de fichiers non
fermés dans les tests documentation sont sans changement.

Recette Chrome locale avec données uniquement en mémoire : création, valeurs par
défaut, consentement incomplet refusé et saisies conservées, modification,
désactivation, lecture sans boutons d'écriture, affichage mobile sans débordement
horizontal et absence d'erreurs JavaScript. Les captures sont fournies séparément.

La comparaison syntaxique confirme que seules `admin_network_access` et
`admin_network_contact` changent parmi les fonctions existantes. Aucune autre
route admin n'est modifiée. Les autres ajouts sont propres à Réseau.

Avant toute mise en service ultérieure, vérifier/autoriser séparément
l'attribution explicite de `reseau.write` aux rôles concernés. Aucun rôle distant
n'a été lu ou modifié pendant cette préparation. Les tests simulés ne prouvent
pas une écriture de production ni les ACL Grist réelles.

Limites : les modifications concurrentes d'un même champ restent au dernier
enregistrement. Après un timeout Grist, le résultat de l'écriture peut être
incertain ; aucune relance automatique n'est effectuée. Vérifier la liste avant
de recréer une fiche pour éviter un doublon. L'audit applicatif n'est pas une
transaction atomique avec Grist et ne fournit pas de garantie d'archivage durable.
Ces limites ne requièrent aucune écriture de schéma dans ce lot.

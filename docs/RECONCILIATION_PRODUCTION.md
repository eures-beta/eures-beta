# Provenance du code EURES repris

## Origine vérifiée

Le code de référence repris correspond au commit `5d46873e6210956875eb9401596caad137df548a` du dépôt historique. Cette note conserve la provenance du code, sans journal d’exploitation ni configuration d’hébergement.

Le `main` du dépôt GitHub dédié est alors au commit `d64f88cd5cbc260c8249cd9ba3842158bc876247`. La source déployée provient du dépôt historique commun ; copier celui-ci intégralement introduirait FAGERH et des documents privés dans ce dépôt public.

## Périmètre repris

- Formulaires et pages publiques EURES, matching, invitations et candidatures spontanées.
- Suivi des mises en relation, consentement et confirmation du numéro WhatsApp selon le parcours déployé.
- Administration des employeurs, suivi projet et documentation.
- Moteur d’habilitations, sessions personnelles, Réseau avec lecture et écriture, administration des utilisateurs et droits.
- Correction de la cible stable du journal d’audit Réseau.
- Modules, ressources et tests EURES nécessaires.

Le manifeste `reconciliation-production.json` liste le commit source, les chemins repris, les exclusions et les adaptations.

## Adaptations au dépôt dédié

Le mode EURES par défaut et les restrictions existantes sont conservés. Une vérification commune bloque les routes d’autres formulaires avant leur authentification et leur traitement. Les imports, pages Analytics, démarrage et montage de l’application FAGERH sont exclus. Le code utilitaire partagé déjà présent dans le serveur historique n’a pas été réécrit.

L’alias de connexion `/admin/eures-beta/magic` du dépôt dédié est conservé en plus de `/magic-login`. L’ancien endpoint de groupes WhatsApp n’est pas réintroduit : il est absent de la version de production retenue. Les tests existants sont adaptés pour vérifier son absence et l’absence d’écriture.

Les destinataires personnels des helpers d’envoi de test sont remplacés par des adresses `example.test` et les fixtures techniques utilisent des identités fictives. Ces destinataires ne permettent pas un envoi de démonstration réel ; leur configuration devra être décidée séparément avant un tel essai.

## Documents privés

Les fichiers sous `private_documents/` ne sont pas importés et sont ignorés par Git. Les liens et les contrôles d’accès présents dans le code déployé sont conservés. En l’absence de fichiers provisionnés séparément, une demande authentifiée renvoie 404. Aucun document privé ne doit être ajouté au dépôt public. Le test de cette route utilise un fichier temporaire synthétique.

## Validation et limites

Exécuter :

```bash
uv run python scripts/test_reconciliation_offline.py
```

Cette commande désactive dotenv, retire les paramètres de services du processus de test et bloque les connexions externes. Les accès Grist et Brevo des tests sont simulés. Les tests FAGERH sont exclus.

Résultat local : **167 tests réussis**, aucun échec ; syntaxe de **6 scripts JavaScript** vérifiée ; contrôle Git des espaces réussi.

La réussite locale n’autorise pas un déploiement : restent à vérifier la configuration de l’environnement cible, les habilitations Grist effectives, les parcours authentifiés, le provisionnement des documents privés et la procédure de retour arrière. Les deux produits, EURES et FAGERH, restent séparés.

La PR du README est indépendante ; son fichier n’est pas remplacé par cette réconciliation. La sauvegarde locale des travaux des 8 et 9 septembre est conservée jusqu’à validation de la reprise.

Cette note décrit la provenance du code ; elle ne décrit pas le déploiement d’un environnement.

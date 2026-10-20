# Chargement de l’administration — 20 octobre 2026

## Correction

L’ouverture lançait simultanément les tâches, le cockpit, les invitations, deux listes de réponses, le contrôle Brevo et les matchings. Le cockpit et les tâches relisaient plusieurs fois les mêmes tables Grist.

- Les tâches se chargent d’abord ; viennent ensuite le cockpit et les deux listes de réponses nécessaires aux alertes. La surveillance périodique démarre après ces chargements.
- Les invitations, matchings et contrôles Brevo se chargent à l’ouverture de leurs panneaux via les gestionnaires existants.
- Les constructeurs des tâches et du cockpit réutilisent chaque lecture Grist identique pendant leur calcul, y compris les appels imbriqués. La clé distingue URL, document, table, en-têtes et limite. Les résultats sont copiés pour éviter les mutations partagées.
- Le cache disparaît en fin de calcul, y compris en cas d’erreur. Il est isolé par contexte ; aucune donnée n’est réutilisée entre requêtes. Aucune invalidation après une écriture n’est nécessaire.
- Ces lectures ont un délai de connexion de 3,05 secondes et un délai de lecture de 15 secondes. Ce ne sont pas des délais globaux pour toute la requête ; Grist reste une dépendance du tableau de bord.

## Vérifications locales

Tests Python avec données fictives et réseau externe bloqué : réutilisation, isolation des paramètres et des contextes concurrents, copies, erreurs, portée et comparaison du résultat des véritables constructeurs avec/sans réutilisation. Dans la configuration fictive à un document, chaque constructeur lit quatre tables, une fois chacune.

Test JavaScript : une réponse des tâches volontairement bloquée empêche le démarrage du cockpit ; le cockpit précède les listes de réponses et la surveillance. Les panneaux différés ne sont pas chargés par cette séquence.

Recette navigateur sur serveur local isolé : accueil des tâches, ouverture des invitations et des matchings à valider. Aucune donnée réelle ni aucun appel externe.

Les textes, le visuel, les permissions et les contrats API restent identiques. Le temps gagné en production n’est pas mesuré ici. Aucun déploiement ni changement des données Grist n’est inclus.

## Retour arrière

Revenir au commit précédent de cette correction. Aucune migration de données ni configuration supplémentaire.

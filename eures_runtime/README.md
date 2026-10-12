# Runtime applicatif EURES autonome

Copie applicative Flask/Grist séparée de FAGERH, issue de la reprise e939cd6 et comparée au code métier déployé. La configuration de transport est injectée par environnement. Les modules de statistiques utilisent une projection limitée aux champs nécessaires.

Le démarrage historique à la racine est conservé. Cette copie figée rend traçable la version portable ; une consolidation ultérieure sera nécessaire pour éviter deux sources divergentes. Les recettes de production, serveurs, images et adaptateurs de démarrage sont gérés dans le dépôt privé de l’équipe.

Tests : installer requirements.lock dans un environnement isolé puis exécuter python eures_runtime/run_tests.py. Aucun secret n’est nécessaire.

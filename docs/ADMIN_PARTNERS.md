# Bandeau partenaires et accès documentation — 20 octobre 2026

Branche locale : `codex/admin-partners-documentation`, issue de `origin/main` à `28dda0c`.

La page principale d’administration Flask affiche les ressources EURES/ELA, France Travail, ADEM et Le Forem. Les fichiers fournis sont conservés sans altération ; les proportions sont préservées et les images possèdent des alternatives textuelles. Sur mobile, le bandeau utilise deux colonnes.

Le lien direct Documentation mène à la route existante `/admin/eures-beta/documentation`, toujours protégée par son authentification actuelle. Libellé FR/EN : Documentation ; DE : Dokumentation lorsque `lang=de`. Les autres textes historiques de cette page restent en français.

Validation locale : 9 tests de documentation réussis ; aperçu statique vérifié sur ordinateur (1280 px) et mobile (390 px), images chargées et absence de débordement horizontal à 390 px ; contrôle de blancs réussi sur le diff HTML. Aucun appel métier réel, aucune écriture Grist, aucun déploiement. Le SVG officiel contient des espaces de fin de ligne préexistants conservés à l’identique.

Limites : l’aperçu vérifie uniquement l’en-tête, sans charger les données de l’administration. La page distante n’a pas pu être inspectée par l’outil web. La conformité complète EURES/ELA et WCAG AA n’est pas certifiée. PR préparée à la demande d’Eric sous le titre « mise à jour des liens présents dans l'Admin ».

Le lien existant vers `/admin/eures-beta/reseau` porte désormais le libellé « Annuaire ». Le lien « Utilisateurs & droits », les destinations et les contrôles d’accès existants sont conservés.

# R4 — Audit Sauvegardes, Protection des données et Système local

## Portée

R4 part de la baseline qualifiée `3f02eac` : design Watteau gelé, Signalements gelé, Réparations qualifié dans le vrai EXE packagé.

R4 couvre uniquement :

- la vue **Sauvegardes** ;
- la vue **Protection des données** ;
- la vue **Système local** ;
- les services IPC et fichiers nécessaires à ces trois vues ;
- leurs preuves dans le vrai binaire Windows packagé.

Aucun asset Watteau, aucune charte graphique globale, aucun module Signalements/Réparations ne doit être rouvert sans régression démontrée.

## État déjà solide

### Sauvegarde locale

- `createBackup()` vérifie l’intégrité SQLite avant copie.
- La base est sauvegardée via l’API SQLite de backup.
- Les photos sont copiées hors corbeille interne.
- Un manifeste versionné est écrit.
- Les sauvegardes locales sont limitées aux 14 plus récentes.
- Une sauvegarde quotidienne est tentée au démarrage.

### Sauvegarde chiffrée

- Format externe `.rdlbackup`.
- Chiffrement authentifié AES-256-GCM.
- Phrase secrète non persistée.
- Longueur minimale de phrase secrète contrôlée.
- Tests existants : aller-retour exact, mauvais secret refusé, fichier altéré refusé.

### Restauration

- Déchiffrement dans un dossier `pending-restore`.
- Validation du manifeste et `PRAGMA quick_check` avant activation.
- Création d’une sauvegarde de sécurité avant restauration.
- Marqueur de restauration écrit avant redémarrage.
- Tentative de rollback vers la sauvegarde de sécurité en cas d’échec d’application.

### Protection des données

- Politique de conservation désactivée par défaut.
- Réduction explicite des identifiants structurés.
- Suppression contrôlée avec confirmation du numéro de dossier.
- Registre de purge externe à la base pour empêcher la résurrection après restauration d’une ancienne sauvegarde.
- Export de revue de droits au format JSON avec avertissement tiers.
- Événements de confidentialité persistants.

### Système local

- API renderer exposée uniquement via `contextBridge`.
- IPC vérifié par origine `file://`, fenêtre et frame principale.
- Ouverture bornée aux dossiers racine / sauvegardes / exports connus par l’application.
- Health check local : intégrité, statistiques, politique de conservation et chemins.
- Réseau HTTP(S) métier bloqué.

## P0 — Robustesse des fichiers et crash-consistency

### P0.1 — Création de sauvegarde non finalisée atomiquement

`createBackup()` crée directement le dossier final `backup-<timestamp>` puis y écrit base, photos et manifeste.

Si le processus s’arrête après la création du dossier mais avant la fin du manifeste, un répertoire `backup-*` incomplet peut rester présent et être compté par la logique de rétention.

**Cible :** écrire dans un dossier de staging (`.backup-incoming-*`), valider la base et le manifeste, puis renommer vers le nom final uniquement à la fin. Au démarrage, éliminer les anciens staging non finalisés.

### P0.2 — Application d’une restauration non transactionnelle au niveau fichiers

`replaceActiveDataFromSnapshot()` prépare une base entrante et un dossier photos entrant, mais supprime ensuite successivement la base active puis les photos actives avant les renommages finaux.

Une panne machine ou un arrêt brutal entre ces opérations peut laisser un état mixte ou incomplet.

**Cible :** protocole de restauration à états explicites :

1. validation complète du snapshot ;
2. staging entrant ;
3. sauvegarde locale de sécurité validée ;
4. fermeture des accès actifs ;
5. bascule avec noms temporaires `active.previous` / `incoming` ;
6. vérification de la nouvelle base ;
7. commit de la bascule ;
8. nettoyage différé de l’ancien état ;
9. récupération déterministe au démarrage si un marqueur indique une bascule interrompue.

### P0.3 — `pending-restore` partiel en cas d’échec avant création du marqueur

Le dossier `pending-restore` est supprimé avant extraction, mais une erreur de déchiffrement/extraction/validation peut laisser un contenu partiel tant qu’aucune nouvelle tentative n’est lancée.

**Cible :** extraction dans un staging unique, nettoyage systématique en `catch/finally`, puis renommage en `pending-restore` seulement après validation.

## P1 — Contrats métier et preuve packagée

### P1.1 — Aucun parcours packagé de sauvegarde locale

Les tests unitaires valident le moteur, mais le vrai EXE n’a pas encore de preuve automatisée : clic UI -> création -> présence du manifeste -> base lisible -> photos copiées -> rétention.

### P1.2 — Aucun parcours packagé export chiffré / annulation / mauvais secret

Le moteur cryptographique est testé hors UI. Il manque la preuve du contrat UI + IPC + dialogue fichier + résultat réel.

Le gate devra couvrir au minimum :

- annulation du dialogue sans effet ;
- export réel ;
- fichier non vide ;
- restauration préparée avec bon secret ;
- refus avec mauvais secret ou contenu altéré ;
- phrase secrète jamais persistée dans le renderer, la base ou les fichiers de configuration.

### P1.3 — Aucun parcours packagé de restauration après redémarrage

La qualification doit créer une fixture isolée, exporter une sauvegarde, modifier la base, préparer la restauration, redémarrer le vrai EXE, puis vérifier que l’ancien état est restauré et que le marqueur/pending staging sont nettoyés.

### P1.4 — États busy / erreurs / double activation

Les actions critiques doivent empêcher les doubles clics et refléter un état `aria-busy`/disabled pendant les opérations longues.

À vérifier spécifiquement :

- sauvegarde locale depuis topbar et vue Sauvegardes ;
- export chiffré ;
- préparation de restauration ;
- export de revue ;
- réduction d’identifiants ;
- purge.

### P1.5 — Contrat des ouvertures de dossiers système

`openDataFolder`, `openBackupsFolder`, `openExportsFolder` ciblent des chemins internes connus. La preuve packagée doit vérifier que l’UI appelle bien ces trois services et qu’aucune API renderer ne permet d’ouvrir un chemin arbitraire.

### P1.6 — Health check incomplet pour un diagnostic utilisateur

Le health check remonte intégrité, statistiques, politique et chemins, mais pas encore :

- espace disque disponible ;
- état de la dernière sauvegarde locale ;
- présence d’une restauration en attente ;
- version du format de base/sauvegarde ;
- état des dossiers photos/sauvegardes/exports en lecture-écriture.

**Cible :** enrichir le diagnostic sans exposer de secret ni de données métier sensibles.

## P2 — UX et gouvernance

### P2.1 — Lisibilité des opérations de confidentialité

Les événements sont présents mais doivent être relus en contexte utilisateur : date/heure, opération, dossier concerné, résultat, sans exposer inutilement d’identité.

### P2.2 — Explication des sauvegardes et restaurations

L’interface doit distinguer explicitement :

- sauvegarde locale automatique/manuelle ;
- sauvegarde externe chiffrée ;
- restauration préparée ;
- redémarrage requis ;
- sauvegarde de sécurité créée automatiquement avant restauration.

### P2.3 — Preuve visuelle multi-viewport

Les trois vues devront être capturées dans le vrai EXE en 1440×900 et 1024×720 avec la charte Watteau déjà gelée. Aucun changement du hero/sidebar/logo/icône n’est autorisé dans R4.

## Gates de sortie R4

R4 ne pourra être gelé que si :

1. `npm run verify` est vert ;
2. les tests fichiers couvrent crash/staging/rollback ;
3. le vrai EXE crée et valide une sauvegarde locale ;
4. le vrai EXE exporte une sauvegarde chiffrée et refuse un secret invalide ;
5. le vrai EXE prépare puis applique une restauration après redémarrage ;
6. le registre de purge reste effectif après restauration ;
7. les trois ouvertures de dossiers sont bornées ;
8. le health check enrichi est cohérent ;
9. les vues Sauvegardes / Protection des données / Système local passent clavier, responsive et captures packagées ;
10. aucun asset ou contrat visuel Watteau gelé n’a changé.

## Ordre de réalisation recommandé

1. **R4-P0 — backup staging atomique** ;
2. **R4-P0 — restore staging + récupération après interruption** ;
3. **R4-P1 — tests unitaires crash/rollback** ;
4. **R4-P1 — health check enrichi** ;
5. **R4-P1 — parcours packagé Sauvegardes/Restauration** ;
6. **R4-P1 — parcours packagé Confidentialité/Système** ;
7. **R4-P2 — passe UX/accessibilité/responsive** ;
8. **R4 visual/package gate** ;
9. gel R4 dans `main` uniquement après preuves vertes.

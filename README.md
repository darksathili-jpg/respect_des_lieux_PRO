# Respect des Lieux PRO — V5 local-first

Application desktop locale de suivi des dégradations et mesures associées, conçue pour **un seul utilisateur sur un seul PC Windows**.

> Le projet historique `darksathili-jpg/respect-des-lieux` reste indépendant et actif. Cette V5 ne modifie ni son code, ni son projet Supabase, ni ses données.

## État actuel

**V5.2.0-alpha.1 — Professional Desktop Qualification**

La V5 est désormais une application desktop autonome en cours de qualification professionnelle :

- Electron pour l'application Windows ;
- SQLite local pour les signalements et réparations ;
- photos JPEG stockées comme fichiers locaux, jamais en Base64 dans la base ;
- aucune API métier cloud, aucune télémétrie, réseau HTTP(S) bloqué ;
- identités masquées par défaut ;
- métadonnées EXIF/XMP/IPTC/commentaires retirées des photos ;
- 2 photos maximum par signalement, 3 Mo chacune, doublons refusés ;
- contrôle préventif de l'espace disque avant copie d'une photo ;
- numérotation annuelle transactionnelle ;
- date de clôture explicite ;
- politique de conservation **sans durée imposée par le logiciel** ;
- tableau de réexamen des dossiers clos ;
- réduction contrôlée des identifiants structurés ;
- suppression définitive confirmée par le numéro du dossier ;
- registre de purge hors de la base restaurable pour éviter la réapparition d'un dossier supprimé après restauration ;
- préparation d'un dossier JSON de revue pour l'exercice des droits ;
- snapshots locaux cohérents ;
- export externe chiffré `.rdlbackup` en AES-256-GCM avec clé dérivée par scrypt ;
- restauration guidée avec contrôle SQLite et sauvegarde de précaution ;
- phrase secrète de sauvegarde jamais persistée ;
- tests de charge 5 000 signalements / 10 000 réparations ;
- tests de fermeture brutale avant et après `COMMIT` ;
- build Windows NSIS x64 construite automatiquement ;
- Electron Fuses de durcissement appliqués au package.

## Données locales

Sous Windows :

```text
%LOCALAPPDATA%\Respect des Lieux PRO\
├── data\
│   └── respect-des-lieux.sqlite3
├── photos\
├── backups\
├── exports\
├── privacy-purge-ledger.json
└── restore-pending.json        # uniquement lorsqu'une restauration est préparée
```

Les données métier ne sont pas stockées dans `localStorage`, IndexedDB ou le cache du navigateur.

## Fiabilité SQLite

La base utilise notamment :

- `PRAGMA journal_mode = WAL` ;
- `PRAGMA synchronous = FULL` ;
- `PRAGMA foreign_keys = ON` ;
- `BEGIN IMMEDIATE` pour la numérotation transactionnelle ;
- `PRAGMA quick_check` pour le diagnostic ;
- l'API officielle `node:sqlite` afin d'éviter une dépendance native externe pour SQLite.

La V5.2 ajoute une qualification automatisée sur 5 000 signalements et 10 000 réparations ainsi que deux scénarios de fermeture brutale : persistance d'une transaction validée et rollback d'une transaction interrompue.

## Sécurité Electron

La fenêtre principale utilise notamment :

```text
contextIsolation: true
nodeIntegration: false
sandbox: true
webSecurity: true
spellcheck: false
```

Le renderer n'accède jamais directement au système de fichiers ni à SQLite. Une API IPC minimale est exposée par `preload.cjs`; le processus principal vérifie que les appels proviennent du document local principal.

La Content Security Policy impose `connect-src 'none'`. Electron annule toute requête `http://` ou `https://`, refuse les permissions navigateur et interdit les nouvelles fenêtres ou la navigation distante. Les DevTools sont désactivés dans l'application empaquetée.

Le package V5.2 active également des Electron Fuses : mode `RunAsNode` interdit, variables `NODE_OPTIONS` et inspection CLI désactivées, intégrité ASAR validée, application chargée uniquement depuis l'ASAR et privilèges supplémentaires du protocole fichier désactivés.

## Protection des données en milieu scolaire

Le projet suit une démarche **privacy-by-design**, mais une application locale n'est pas automatiquement « conforme RGPD ».

Avant production, le traitement doit être cadré avec le responsable de traitement et le DPD : finalité, base légale, registre, catégories de données et destinataires, information des personnes, durée de conservation, criblage AIPD, habilitations, sécurité du poste et procédure en cas de violation de données.

La V5 n'impose volontairement aucune durée de conservation. La politique de réexamen ne peut être activée que si l'utilisateur confirme qu'une durée a été validée dans la gouvernance de l'établissement. Aucun dossier n'est effacé automatiquement.

Audit protection des données : [`docs/AUDIT-RGPD-V5.md`](docs/AUDIT-RGPD-V5.md)

Production gate : [`docs/PRODUCTION-GATE-V5.1.md`](docs/PRODUCTION-GATE-V5.1.md)

Audit qualification/parité : [`docs/AUDIT-V5.2-PROFESSIONAL-QUALIFICATION.md`](docs/AUDIT-V5.2-PROFESSIONAL-QUALIFICATION.md)

## Sauvegardes

Deux niveaux existent :

1. **snapshots locaux** : copie cohérente SQLite + photos, 14 versions glissantes ;
2. **sauvegarde externe chiffrée** : fichier `.rdlbackup` protégé par AES-256-GCM et scrypt, à conserver sur un support distinct.

La restauration chiffrée est préparée sans toucher immédiatement à la base active : l'archive est déchiffrée, son manifeste est contrôlé, `PRAGMA quick_check` est exécuté et une sauvegarde de précaution de l'état actuel est créée. La restauration est ensuite appliquée au redémarrage.

## Développement et qualification

Pré-requis de développement : Node.js 24.21+.

```bash
npm install
npm start
npm run verify
```

Build Windows de qualification :

```bash
npm run dist:win
```

Le workflow **V5.2 Windows Professional Qualification** construit également un installateur NSIS x64 et le conserve comme artefact GitHub Actions. Cet installateur est **non signé** et réservé aux essais de qualification.

## Gates automatiques

Chaque modification applicative est soumise au **V5 Local Reliability Gate**. Les modifications pertinentes déclenchent en plus **V5.2 Windows Professional Qualification**, qui :

- installe la chaîne desktop épinglée ;
- exécute l'ensemble des tests ;
- construit l'installateur NSIS x64 ;
- vérifie la présence du `.exe` ;
- conserve l'installateur de qualification comme artefact temporaire.

Les tests contrôlent notamment SQLite, crash/rollback, photos, minimisation, cycle de vie, purge, revue des droits, sauvegarde/restauration chiffrées, frontières Electron et configuration de packaging.

## Statut de production

**Pas encore validé pour une mise en production réelle.** V5.2 est désormais une build Windows installable de qualification. Les verrous restants sont : test réel sur le PC cible avec données fictives, épreuve disque presque plein, audit visuel/accessibilité, parité fonctionnelle décidée avec V4.3, choix d'une stratégie de signature/déploiement et validation du Production Gate établissement/DPD.

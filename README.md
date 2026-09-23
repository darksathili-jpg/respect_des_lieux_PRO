# Respect des Lieux PRO — V5 local-first

Nouvelle branche applicative de **Respect des Lieux**, conçue pour **un seul utilisateur sur un seul PC Windows**.

> Le projet historique `darksathili-jpg/respect-des-lieux` reste indépendant et actif. Cette V5 ne modifie ni son code, ni son projet Supabase, ni ses données.

## Objectif

Remplacer progressivement le backend cloud de la V4.3 par une application desktop locale :

- Electron pour l'application Windows ;
- SQLite pour les signalements et réparations ;
- photos stockées comme fichiers locaux, jamais en Base64 dans la base ;
- aucun Supabase, aucun appel métier réseau, aucune télémétrie ;
- sauvegarde SQLite cohérente + copie des photos ;
- 14 sauvegardes glissantes conservées sur le poste ;
- installateur Windows prévu via `electron-builder`.

## État actuel

**V5.0.0-alpha.1 — Local Desktop Foundation**

Cette première fondation est déjà fonctionnelle pour :

- créer et consulter des signalements ;
- générer des numéros annuels transactionnels (`2026-0001`, etc.) ;
- ajouter des réparations ;
- joindre des JPEG de 3 Mo maximum ;
- clore / rouvrir un signalement ;
- vérifier l'intégrité SQLite ;
- créer une sauvegarde locale ;
- effectuer une sauvegarde quotidienne au démarrage ;
- empêcher deux instances concurrentes de l'application.

La reprise exhaustive de toutes les fonctions et du rendu de la V4.3 sera faite par étapes, sans couper l'ancienne application.

## Où sont stockées les données ?

Sous Windows, l'application force son répertoire de données sous `%LOCALAPPDATA%` afin d'éviter le profil roaming :

```text
%LOCALAPPDATA%\Respect des Lieux PRO\
├── data\
│   └── respect-des-lieux.sqlite3
├── photos\
└── backups\
    └── backup-AAAA-MM-JJTHH-MM-SS-...\
        ├── respect-des-lieux.sqlite3
        ├── photos\
        └── manifest.json
```

Les données métier ne sont pas stockées dans `localStorage`, IndexedDB ou le cache du navigateur.

## Fiabilité

La base locale utilise :

- `PRAGMA journal_mode = WAL` ;
- `PRAGMA synchronous = FULL` ;
- `PRAGMA foreign_keys = ON` ;
- `BEGIN IMMEDIATE` pour la numérotation transactionnelle ;
- `PRAGMA quick_check` pour le diagnostic ;
- l'API officielle `node:sqlite` pour éviter les problèmes de modules natifs ABI de `better-sqlite3`.

Electron 44 embarque Node 24, compatible avec `node:sqlite` et son API de sauvegarde.

## Sécurité Electron

La fenêtre principale est créée avec :

```text
contextIsolation: true
nodeIntegration: false
sandbox: true
```

Le renderer n'accède jamais directement au système de fichiers ni à SQLite. Une API minimale est exposée par `preload.cjs` et transite par IPC vers le processus principal.

Le HTML applique également une Content Security Policy `default-src 'self'` et ne charge aucune ressource distante.

## Développement

Pré-requis : Node.js 24+.

```bash
npm install
npm start
```

Tests :

```bash
npm test
```

Vérification complète :

```bash
npm run verify
```

Création de l'installateur Windows :

```bash
npm run dist:win
```

## Reliability Gate

Chaque push sur `main` déclenche le workflow **V5 Local Reliability Gate** sur Windows avec Node 24. Il vérifie notamment :

- la syntaxe JavaScript ;
- la création et l'intégrité de la base ;
- la numérotation annuelle ;
- les relations signalement → réparation ;
- le coffre photo JPEG / 3 Mo ;
- une vraie sauvegarde SQLite relisible ;
- l'absence de backend cloud dans le renderer ;
- l'isolement Electron.

## Roadmap

### V5.0 — Local Desktop Foundation
Architecture Electron + SQLite, stockage photo local, sauvegardes et premiers tests de fiabilité.

### V5.1 — Parité fonctionnelle V4.3
Reprise détaillée de l'interface, filtres, statistiques, formulaires et ergonomie de la V4.3.

### V5.2 — Photo Vault
Prévisualisation, gestion avancée des pièces jointes, contrôle d'intégrité et déduplication.

### V5.3 — Backup & Restore
Restauration guidée, export portable, contrôle avant restauration et scénario de reprise après panne.

### V5.4 — Reliability Gate
Tests disque plein, fermeture brutale, base verrouillée, corruption simulée, milliers de dossiers, double lancement et restauration.

### V5.5 — Windows Release
Installateur signé si possible, procédure de déploiement et documentation utilisateur.

## Principe de migration

La V4.3 cloud et la V5 locale restent **en parallèle** tant que la V5 n'a pas passé ses tests de parité et de reprise après incident. Aucun arrêt ni suppression de l'ancienne solution ne doit être effectué pendant cette phase.

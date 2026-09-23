# Respect des Lieux PRO — V5 local-first

Nouvelle branche applicative de **Respect des Lieux**, conçue pour **un seul utilisateur sur un seul PC Windows**.

> Le projet historique `darksathili-jpg/respect-des-lieux` reste indépendant et actif. Cette V5 ne modifie ni son code, ni son projet Supabase, ni ses données.

## Objectif

Remplacer progressivement le backend cloud de la V4.3 par une application desktop locale :

- Electron pour l'application Windows ;
- SQLite pour les signalements et réparations ;
- photos stockées comme fichiers locaux, jamais en Base64 dans la base ;
- aucun backend cloud, aucun appel métier réseau, aucune télémétrie ;
- sauvegarde SQLite cohérente + copie des photos ;
- 14 sauvegardes glissantes conservées sur le poste ;
- installateur Windows prévu via `electron-builder`.

## État actuel

**V5.0.1-alpha.1 — Local Desktop + School Privacy Hardening**

Cette fondation est déjà fonctionnelle pour :

- créer et consulter des signalements ;
- générer des numéros annuels transactionnels (`2026-0001`, etc.) ;
- ajouter des réparations ;
- joindre des JPEG de 3 Mo maximum ;
- retirer les métadonnées EXIF/XMP/IPTC/commentaires des photos avant stockage ;
- ne pas conserver le nom original du fichier photo ;
- masquer les identités des élèves par défaut et les remasquer dès que la fenêtre perd le focus ;
- clore / rouvrir un signalement ;
- vérifier l'intégrité SQLite ;
- créer une sauvegarde locale ;
- effectuer une sauvegarde quotidienne au démarrage ;
- empêcher deux instances concurrentes de l'application ;
- bloquer toute requête HTTP(S) dans la session Electron ;
- refuser les permissions navigateur et limiter l'IPC au document local principal.

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
webSecurity: true
spellcheck: false
```

Le renderer n'accède jamais directement au système de fichiers ni à SQLite. Une API minimale est exposée par `preload.cjs` et transite par IPC vers le processus principal. Les appels IPC sont vérifiés côté processus principal.

Le HTML applique une Content Security Policy avec `connect-src 'none'`. En complément, Electron annule toute requête `http://` ou `https://` de la session applicative. Les DevTools sont désactivés dans l'application empaquetée.

## Protection des données en milieu scolaire

La V5 intègre désormais une première couche **privacy-by-design**, mais elle ne doit pas être présentée comme « conforme RGPD par le seul fait d'être locale ».

Avant toute mise en production, le responsable de traitement et le DPD doivent notamment valider :

- finalité ;
- base légale ;
- inscription/rattachement au registre des traitements ;
- catégories de données et destinataires ;
- durée de conservation ;
- information des personnes ;
- criblage AIPD ;
- sécurité du poste Windows ;
- sauvegarde externe protégée ;
- procédure en cas de violation de données.

Audit détaillé : [`docs/AUDIT-RGPD-V5.md`](docs/AUDIT-RGPD-V5.md)

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
- la suppression des métadonnées photo ;
- une vraie sauvegarde SQLite relisible ;
- l'absence de backend cloud exécutable dans le renderer ;
- l'isolement Electron ;
- le blocage réseau et permissions ;
- la minimisation du formulaire ;
- le masquage des identités par défaut.

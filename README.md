# Respect des Lieux PRO — V5 local-first

Application desktop locale de suivi des dégradations et mesures associées, conçue pour **un seul utilisateur sur un seul PC Windows**.

> Le projet historique `darksathili-jpg/respect-des-lieux` reste indépendant et actif. Cette V5 ne modifie ni son code, ni son projet Supabase, ni ses données.

## État actuel

**V5.1.0-alpha.1 — School Data Lifecycle Gate**

La V5 est désormais une branche applicative autonome et non une simple page web hors ligne :

- Electron pour l'application Windows ;
- SQLite local pour les signalements et réparations ;
- photos JPEG stockées comme fichiers locaux, jamais en Base64 dans la base ;
- aucune API métier cloud, aucune télémétrie, réseau HTTP(S) bloqué ;
- identités masquées par défaut ;
- métadonnées EXIF/XMP/IPTC/commentaires retirées des photos ;
- numérotation annuelle transactionnelle ;
- date de clôture explicite ;
- politique de conservation **sans durée imposée par le logiciel** ;
- tableau de réexamen des dossiers clos ;
- réduction contrôlée des identifiants structurés ;
- suppression définitive confirmée par le numéro du dossier ;
- registre de purge conservé hors de la base restaurable pour éviter la réapparition d'un dossier supprimé après restauration d'une ancienne sauvegarde ;
- préparation d'un dossier JSON de revue pour l'exercice des droits, avec avertissement de revue des données de tiers ;
- sauvegardes locales cohérentes ;
- export externe chiffré `.rdlbackup` en AES-256-GCM avec clé dérivée par scrypt ;
- restauration guidée : déchiffrement, contrôle SQLite, sauvegarde de précaution puis application au redémarrage ;
- la phrase secrète de sauvegarde n'est jamais persistée.

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

## Sécurité Electron

La fenêtre principale est créée avec :

```text
contextIsolation: true
nodeIntegration: false
sandbox: true
webSecurity: true
spellcheck: false
```

Le renderer n'accède jamais directement au système de fichiers ni à SQLite. Une API IPC minimale est exposée par `preload.cjs`; le processus principal vérifie que les appels proviennent bien du document local principal.

La Content Security Policy impose `connect-src 'none'`. Electron annule en plus toute requête `http://` ou `https://`, refuse les permissions navigateur et interdit l'ouverture de nouvelles fenêtres ou la navigation distante. Les DevTools sont désactivés dans l'application empaquetée.

## Protection des données en milieu scolaire

Le projet suit une démarche **privacy-by-design**, mais une application locale n'est pas automatiquement « conforme RGPD ».

Pour le second degré, les ressources Éduscol indiquent que le chef d'établissement est responsable des traitements mis en œuvre dans l'établissement. Avant production, le traitement doit donc être cadré avec le responsable de traitement et le DPD : finalité, base légale, registre, catégories de données et destinataires, information des personnes, durée de conservation, criblage AIPD, habilitations, sécurité du poste et procédure en cas de violation de données.

La V5 n'impose volontairement aucune durée de conservation. La politique de réexamen ne peut être activée que si l'utilisateur confirme qu'une durée a été validée dans la gouvernance de l'établissement. Aucun dossier n'est effacé automatiquement.

Références de conception :

- Éduscol — Protection des données personnelles et assistance : https://eduscol.education.gouv.fr/6231/protection-des-donnees-personnelles-et-assistance
- CNIL — Durées de conservation : https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
- CNIL — Sécurité : sauvegarder : https://www.cnil.fr/fr/securite-sauvegarder
- CNIL — Sécuriser les postes de travail : https://www.cnil.fr/fr/securite-securiser-les-postes-de-travail

Audit détaillé : [`docs/AUDIT-RGPD-V5.md`](docs/AUDIT-RGPD-V5.md)

Production gate : [`docs/PRODUCTION-GATE-V5.1.md`](docs/PRODUCTION-GATE-V5.1.md)

## Sauvegardes

Deux niveaux existent :

1. **snapshots locaux** : copie cohérente SQLite + photos, 14 versions glissantes ;
2. **sauvegarde externe chiffrée** : fichier `.rdlbackup` protégé par AES-256-GCM et scrypt, à conserver sur un support distinct.

La restauration chiffrée est préparée sans toucher immédiatement à la base active : l'archive est déchiffrée, son manifeste est contrôlé, `PRAGMA quick_check` est exécuté, puis une sauvegarde de précaution de l'état actuel est créée. La restauration n'est appliquée qu'au redémarrage.

## Développement

Pré-requis : Node.js 24+.

```bash
npm install
npm start
```

Vérification :

```bash
npm run verify
```

Installateur Windows, lorsque le Release Gate sera ouvert :

```bash
npm run dist:win
```

## Reliability Gate

Chaque push sur `main` exécute le workflow **V5 Local Reliability Gate** sur Windows / Node 24. Il contrôle notamment :

- syntaxe de tous les modules critiques ;
- schéma et intégrité SQLite ;
- numérotation annuelle ;
- relations signalement → réparation ;
- assainissement et limite des photos ;
- absence de backend cloud et de stockage navigateur ;
- isolation Electron, blocage réseau et permissions ;
- masquage et minimisation des identités ;
- conservation sans durée arbitraire ;
- suppression contrôlée et registre de purge ;
- préparation d'une revue de droits ;
- chiffrement authentifié de la sauvegarde externe ;
- refus d'un mauvais secret ou d'une archive altérée ;
- aller-retour complet export chiffré → restauration des fichiers.

## Statut de production

**Pas encore validé pour une mise en production réelle.** Les derniers verrous sont le cadrage formel avec l'établissement/DPD, la sécurité du poste cible, un test d'installation Windows, un test de restauration sur le poste cible et l'audit final de parité fonctionnelle avec V4.3.

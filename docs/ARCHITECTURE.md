# Architecture V5 — stockage local

## 1. Frontière de confiance

```text
Renderer HTML/CSS/JS
        │
        │ API minimale window.rdl
        ▼
preload.cjs (contextBridge)
        │
        │ IPC Electron
        ▼
main.cjs
   ├── src/database.cjs  → SQLite
   ├── src/storage.cjs   → photos JPEG
   └── sauvegardes       → snapshot SQLite + photos + manifeste
```

Le renderer est considéré comme non privilégié : il ne possède ni accès Node, ni accès direct au disque, ni connexion à la base.

## 2. Emplacement des données

Sous Windows, `userData` est explicitement déplacé vers `%LOCALAPPDATA%\Respect des Lieux PRO`.

Objectif : conserver les données sur le poste et éviter le stockage par défaut dans un profil roaming.

## 3. SQLite

Le moteur est `node:sqlite`, fourni directement par Node 24 embarqué dans Electron 44. Cela supprime la dépendance à un module natif tiers et les incompatibilités `NODE_MODULE_VERSION` rencontrées avec des modules tels que `better-sqlite3`.

Paramètres importants :

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA trusted_schema = OFF;
```

## 4. Numérotation

La numérotation métier est générée dans une transaction `BEGIN IMMEDIATE` à l'aide de la table `signalement_counters`.

Deux créations concurrentes ne doivent donc pas produire le même numéro.

## 5. Photos

Les photos ne sont jamais stockées dans SQLite. La base conserve uniquement les métadonnées :

- signalement lié ;
- nom original ;
- nom interne ;
- taille ;
- type MIME ;
- SHA-256.

Le fichier doit commencer par la signature JPEG `FF D8 FF` et ne peut pas dépasser 3 Mo.

## 6. Sauvegardes

La base est sauvegardée via l'API `sqlite.backup()`, qui produit un snapshot SQLite cohérent même avec WAL actif. Les photos sont ensuite recopiées et un `manifest.json` est écrit.

Rétention actuelle : 14 sauvegardes locales.

La restauration guidée sera introduite uniquement après ajout de contrôles transactionnels et d'un test automatisé de reprise.

## 7. Réseau

Le renderer ne contient aucun `fetch`, WebSocket, EventSource ou URL Supabase. La Content Security Policy autorise uniquement les ressources locales `self`.

La V5 n'a besoin d'Internet ni pour lire ni pour écrire les données métier.

## 8. Coexistence avec V4.3

Le dépôt et le backend V4.3 restent actifs pendant toute la phase de validation de V5. Aucun mécanisme automatique de synchronisation n'est introduit entre les deux systèmes : cela évite les doubles écritures et les conflits silencieux.

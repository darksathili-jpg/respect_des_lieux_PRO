# Production Gate — Respect des Lieux PRO V5.1

Ce document sépare les **preuves techniques**, les **décisions de gouvernance** et les **tests sur le poste cible**. Une case ne doit être cochée que lorsqu'une preuve existe.

## A. Gouvernance du traitement — établissement / DPD

- [ ] Finalité exacte du traitement validée par le responsable de traitement.
- [ ] Périmètre d'usage défini : ce qui doit être suivi et ce qui est explicitement hors périmètre.
- [ ] Base légale documentée.
- [ ] Traitement inscrit ou rattaché au registre des activités de traitement.
- [ ] Catégories de personnes concernées validées.
- [ ] Catégories de données validées selon le principe de minimisation.
- [ ] Destinataires / personnes habilitées définis.
- [ ] Durée de conservation ou critères de détermination validés.
- [ ] Mention d'information des personnes prête.
- [ ] Contact DPD identifié dans la documentation destinée aux personnes.
- [ ] Criblage AIPD réalisé et conclusion documentée.
- [ ] Procédure de rectification / accès / effacement documentée.
- [ ] Procédure de gestion d'une violation de données documentée.

**Preuves / références :**

> À compléter par l'établissement.

## B. Poste Windows cible

- [ ] PC identifié et administré par l'établissement.
- [ ] Compte Windows nominatif pour l'utilisateur de l'application.
- [ ] Verrouillage automatique de session configuré.
- [ ] Chiffrement du disque / de l'appareil vérifié avec l'administrateur.
- [ ] Correctifs Windows gérés.
- [ ] Protection antimalware gérée et à jour.
- [ ] Utilisation quotidienne sans droits administrateur lorsque possible.
- [ ] Répertoire `%LOCALAPPDATA%\Respect des Lieux PRO` accessible uniquement aux comptes autorisés selon la politique du poste.
- [ ] Procédure de réaffectation / mise au rebut du PC connue.

**Preuves / références :**

> À compléter sur le poste cible.

## C. Preuves techniques V5.1

- [x] SQLite local, sans backend métier cloud.
- [x] HTTP(S) bloqué au niveau de la session Electron.
- [x] Permissions navigateur refusées.
- [x] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- [x] IPC limité au document local principal.
- [x] Données métier absentes de `localStorage`, IndexedDB et `sessionStorage`.
- [x] SQLite WAL + `synchronous=FULL` + clés étrangères.
- [x] Numérotation annuelle transactionnelle.
- [x] `PRAGMA quick_check` disponible.
- [x] JPEG limités à 3 Mo.
- [x] EXIF/XMP/IPTC/commentaires retirés des JPEG à l'import.
- [x] Nom original du fichier photo non conservé.
- [x] Identités masquées par défaut et remasquées à la perte de focus.
- [x] Champ « famille » absent du formulaire V5.
- [x] Aucune durée de conservation imposée par le logiciel.
- [x] Activation d'une durée conditionnée à une confirmation explicite de validation de gouvernance.
- [x] Date de clôture enregistrée.
- [x] Réexamen des dossiers clos sans purge automatique.
- [x] Réduction contrôlée des identifiants structurés.
- [x] Suppression définitive conditionnée à la saisie exacte du numéro de dossier.
- [x] Registre de purge séparé de la base restaurable.
- [x] Préparation d'un dossier de revue des droits avec avertissement relatif aux données de tiers.
- [x] Sauvegarde externe chiffrée AES-256-GCM + scrypt.
- [x] Phrase secrète non persistée par l'application.
- [x] Mauvais secret / archive altérée refusés par les tests automatisés.
- [x] Restauration préparée après validation du manifeste et `PRAGMA quick_check`.
- [x] Sauvegarde de précaution créée avant restauration.
- [x] Reliability Gate Windows exécuté à chaque push sur `main`.

## D. Sauvegarde et reprise sur le terrain

La CNIL recommande des sauvegardes régulières, au moins une copie distincte/hors ligne, une protection équivalente à celle des données actives et des tests de restauration. La règle 3-2-1 est citée comme bonne pratique : https://www.cnil.fr/fr/securite-sauvegarder

- [ ] Support externe choisi et conservé séparément du PC.
- [ ] Sauvegarde `.rdlbackup` créée sur ce support.
- [ ] Phrase secrète conservée séparément de l'archive.
- [ ] Archive copiée sur un second support ou emplacement selon la politique retenue.
- [ ] Restauration complète testée sur le poste cible.
- [ ] Test d'une archive volontairement altérée : restauration refusée.
- [ ] Test avec phrase secrète erronée : restauration refusée.
- [ ] Test d'une ancienne sauvegarde contenant un dossier ensuite purgé : le registre de purge empêche sa réapparition.
- [ ] Date du dernier test de restauration consignée.

**Dernier test de restauration :** `____ / ____ / ______`

## E. Épreuve fonctionnelle et de fiabilité

- [ ] Création de 100 dossiers de test sans erreur.
- [ ] Création de réparations et photos sur un échantillon représentatif.
- [ ] Recherche et filtres testés sur volume réaliste.
- [ ] Fermeture brutale de l'application pendant une utilisation puis contrôle `quick_check`.
- [ ] Redémarrage après extinction Windows non planifiée.
- [ ] Test disque presque plein / erreur d'écriture.
- [ ] Test de deux lancements simultanés : une seule instance active.
- [ ] Test du masquage automatique des identités lors d'un changement de fenêtre.
- [ ] Test d'export de revue des droits puis contrôle manuel des informations de tiers.
- [ ] Test de réduction d'identifiants et de suppression d'un dossier clos.
- [ ] Audit visuel desktop sur le poste cible.
- [ ] Parité fonctionnelle utile avec la V4.3 validée par l'utilisateur.

## F. Distribution Windows

- [ ] Installateur NSIS construit depuis un commit identifié.
- [ ] Installation sur un PC propre testée.
- [ ] Mise à jour depuis une version précédente testée.
- [ ] Données utilisateur préservées lors d'une mise à jour.
- [ ] Désinstallation testée sans suppression silencieuse des données métier.
- [ ] Signature du binaire / stratégie de confiance Windows décidée avant diffusion institutionnelle.
- [ ] Version et hash SHA-256 de l'installateur archivés.

## Décision de mise en production

- **Version examinée :** `5.1.0-alpha.1`
- **Commit :** à renseigner lors du gel de release.
- **Responsable de traitement / validation :** à renseigner.
- **DPD consulté le :** à renseigner.
- **Décision :** ☐ refusée ☐ pilote contrôlé ☐ production
- **Date :** à renseigner.
- **Observations :**

> Une réussite technique de la CI ne vaut pas validation juridique ou organisationnelle. La mise en production n'est ouverte que lorsque les sections applicables sont documentées et que le poste cible a passé les tests de terrain.

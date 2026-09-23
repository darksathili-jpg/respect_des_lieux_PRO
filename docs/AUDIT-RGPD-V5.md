# Audit protection des données — Respect des Lieux PRO V5.1

Date de référence : 23 septembre 2026.

Ce document est un **audit technique et organisationnel de conception**. Il ne remplace ni la décision du responsable de traitement, ni l'avis du DPD, ni une analyse juridique propre à l'établissement.

## 1. Contexte

L'application peut traiter des données permettant d'identifier des élèves mineurs : identité, classe, description d'un incident, mesures prises, personnes référentes et photographies. Elle doit donc être pilotée comme un traitement de données personnelles en milieu scolaire.

Pour le second degré, Éduscol indique que le chef d'établissement est responsable des traitements mis en œuvre dans l'établissement. Le DPD académique doit être associé au cadrage et aux évolutions du traitement.

Références officielles :

- Éduscol — Protection des données personnelles et assistance : https://eduscol.education.gouv.fr/6231/protection-des-donnees-personnelles-et-assistance
- Éduscol — Délégués à la protection des données : https://eduscol.education.gouv.fr/4935/delegues-la-protection-des-donnees-dpd
- CNIL — Durées de conservation : https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
- CNIL — Sécurité : sauvegarder : https://www.cnil.fr/fr/securite-sauvegarder

## 2. Mesures techniques déjà en place

### Local-first et réduction de surface d'exposition

- données métier dans SQLite local ;
- aucun backend cloud requis ;
- aucune télémétrie ;
- Content Security Policy avec `connect-src 'none'` ;
- toute requête HTTP(S) annulée au niveau de la session Electron ;
- permissions navigateur refusées ;
- nouvelles fenêtres et navigation distante interdites ;
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` ;
- IPC limité au document local principal ;
- DevTools désactivés dans l'application empaquetée.

### Intégrité et fiabilité

- SQLite en WAL ;
- `synchronous=FULL` ;
- clés étrangères actives ;
- numérotation annuelle sous `BEGIN IMMEDIATE` ;
- `PRAGMA quick_check` ;
- sauvegardes SQLite cohérentes ;
- une seule instance applicative autorisée.

### Minimisation

- identité élève facultative ;
- classe facultative ;
- déclarant facultatif ;
- champ « famille » retiré du formulaire ;
- identités masquées par défaut ;
- masquage réactivé dès que la fenêtre perd le focus ;
- lorsque les identités sont masquées, la recherche visuelle ne les utilise pas comme canal indirect ;
- messages de saisie demandant des descriptions factuelles et strictement nécessaires.

### Photos

- JPEG uniquement ;
- 3 Mo maximum ;
- EXIF/XMP/IPTC et commentaires supprimés avant stockage ;
- nom original du fichier non conservé ;
- photo stockée hors SQLite ;
- SHA-256 calculé sur le contenu assaini.

Ces protections ne rendent pas une photographie représentant une personne « anonyme » : son usage doit rester nécessaire et proportionné.

## 3. Cycle de vie V5.1

La CNIL rappelle que les données personnelles ne peuvent pas être conservées indéfiniment et que la durée doit être déterminée par le responsable de traitement en fonction de la finalité.

La V5.1 applique ce principe sans inventer une durée à la place de l'établissement :

- aucune durée par défaut ;
- activation impossible sans confirmation explicite d'une validation de gouvernance ;
- date de clôture tracée ;
- calcul d'une échéance de réexamen pour les dossiers clos ;
- aucune suppression automatique ;
- tableau des dossiers à examiner ;
- possibilité de réduire les identifiants structurés d'un dossier clos ;
- avertissement explicite que les textes libres et photographies doivent encore être examinés ;
- suppression définitive possible uniquement pour un dossier clos et après saisie exacte de son numéro.

La suppression ajoute le numéro du dossier à un **registre de purge séparé de la base restaurable**. Après restauration d'une ancienne sauvegarde, l'application réapplique ces purges afin d'éviter qu'un dossier volontairement supprimé réapparaisse silencieusement.

Ce registre ne contient pas le contenu du dossier ; il conserve le numéro technique et la date de purge.

## 4. Droits des personnes

V5.1 fournit un outil de **revue interne** : une recherche ciblée peut produire un JSON regroupant les enregistrements potentiellement concernés.

Ce fichier n'est volontairement pas présenté comme une réponse prête à transmettre. La CNIL rappelle que la réponse à un droit d'accès doit tenir compte des droits et libertés des tiers. L'application affiche donc un avertissement imposant une revue humaine et, si nécessaire, le masquage des données de tiers avant communication.

Référence : https://www.cnil.fr/fr/respecter-les-droits-des-personnes/professionnels-comment-repondre-une-demande-de-droit-dacces

Une procédure organisationnelle reste nécessaire pour la rectification, l'effacement lorsque le droit est applicable, les délais de réponse et la validation de l'identité du demandeur.

## 5. Sauvegarde et reprise V5.1

La CNIL recommande des sauvegardes régulières, au moins une copie distincte/hors ligne, un niveau de protection équivalent à celui des données actives et des tests réguliers de restauration. Elle cite également la règle 3-2-1 comme bonne pratique.

V5.1 apporte désormais :

- snapshots locaux cohérents ;
- 14 sauvegardes glissantes ;
- export externe dans un fichier `.rdlbackup` ;
- chiffrement authentifié AES-256-GCM ;
- clé dérivée de la phrase secrète via scrypt avec sel aléatoire ;
- phrase secrète jamais enregistrée ;
- refus d'une archive modifiée ou d'une phrase secrète incorrecte ;
- déchiffrement dans une zone temporaire ;
- contrôle du manifeste ;
- `PRAGMA quick_check` sur la base restaurée ;
- sauvegarde de précaution de l'état actuel avant bascule ;
- application de la restauration seulement au redémarrage ;
- réapplication du registre de purge après restauration.

Référence : https://www.cnil.fr/fr/securite-sauvegarder

Ce dispositif doit encore être **éprouvé sur le PC cible** avec un vrai support externe et un scénario complet de perte/reprise avant d'être considéré comme validé en production.

## 6. Points bloquants restant avant production

### P0 — Gouvernance

1. finalité exacte approuvée ;
2. base légale documentée ;
3. traitement inscrit ou rattaché au registre ;
4. catégories de personnes et de données validées ;
5. destinataires et habilitations définis ;
6. durée de conservation effectivement décidée ;
7. mention d'information prête ;
8. DPD consulté ;
9. criblage AIPD documenté ;
10. procédure de violation de données définie.

### P0 — Poste Windows cible

- compte Windows nominatif ;
- verrouillage automatique de session ;
- chiffrement du disque vérifié avec l'administrateur ;
- correctifs et protection antimalware gérés ;
- droits non administrateur si possible ;
- politique de réaffectation / mise au rebut du poste ;
- emplacement du support de sauvegarde externe décidé.

Référence : https://www.cnil.fr/fr/securite-securiser-les-postes-de-travail

### P1 — Validation opérationnelle

- installateur Windows construit et testé ;
- test d'installation / mise à jour / désinstallation ;
- test de sauvegarde chiffrée sur support externe ;
- restauration complète sur le poste cible ;
- test d'une restauration contenant un dossier déjà purgé ;
- test coupure brutale / redémarrage ;
- test disque plein ;
- test de volume ;
- audit de parité fonctionnelle avec V4.3 ;
- revue ergonomique avec l'utilisateur réel.

## 7. Production gate

La version ne doit pas être qualifiée « production RGPD validée » tant que le fichier [`PRODUCTION-GATE-V5.1.md`](PRODUCTION-GATE-V5.1.md) n'est pas renseigné et que les décisions relevant de l'établissement ne sont pas formalisées.

## 8. Conclusion intermédiaire

Le choix **local-first, mono-utilisateur, sans backend cloud** réduit sensiblement l'exposition réseau et donne un meilleur contrôle technique du cycle de vie des données. V5.1 apporte désormais des mécanismes concrets de minimisation, réexamen, purge, exercice des droits et reprise chiffrée.

Ces mécanismes techniques ne remplacent pas la gouvernance : conformité et mise en production dépendent encore de la finalité, de la base légale, de la durée de conservation, de l'information des personnes, des habilitations, du poste Windows cible et de la validation avec le DPD.

# Audit protection des données — Respect des Lieux PRO V5

Date de référence : 23 septembre 2026.

Ce document est un **audit technique et organisationnel de conception**. Il ne remplace ni la décision du responsable de traitement, ni l'avis du DPD, ni une analyse juridique propre à l'établissement.

## 1. Contexte et qualification

L'application peut traiter des données permettant d'identifier des élèves mineurs : identité, classe, description d'un incident, mesures prises, personnes référentes et photographies. Elle doit donc être pilotée comme un traitement de données personnelles en milieu scolaire.

Pour le second degré, le ministère indique que le chef d'établissement est responsable des traitements mis en œuvre dans l'établissement. Le DPD académique doit être associé aux nouveaux traitements ou aux modifications de traitements existants.

Références officielles :

- Ministère / Éduscol — Protection des données personnelles et assistance : https://eduscol.education.gouv.fr/6231/protection-des-donnees-personnelles-et-assistance
- Éduscol — Délégués à la protection des données : https://eduscol.education.gouv.fr/4935/delegues-la-protection-des-donnees-dpd
- Ministère — Les enjeux de la protection des données au sein de l'éducation : https://www.education.gouv.fr/les-enjeux-de-la-protection-des-donnees-au-sein-de-l-education-455253

## 2. Points forts techniques déjà acquis

- données métier locales dans SQLite ;
- aucune API cloud ou télémétrie nécessaire ;
- requêtes HTTP(S) bloquées au niveau Electron ;
- renderer isolé de Node (`contextIsolation`, `sandbox`, `nodeIntegration: false`) ;
- IPC limité au document principal local ;
- Content Security Policy locale ;
- SQLite en WAL, `synchronous=FULL`, clés étrangères, transactions ;
- sauvegarde SQLite cohérente ;
- JPEG limités à 3 Mo ;
- métadonnées EXIF/XMP/IPTC et commentaires retirés à l'import ;
- nom de fichier source non conservé ;
- identités masquées par défaut dans les listes et remasquées dès que la fenêtre perd le focus ;
- absence du champ « famille » dans le formulaire V5 ;
- aucun stockage de données métier dans `localStorage`, IndexedDB ou le cache web applicatif.

## 3. Écarts bloquants avant une version de production

### P0 — Gouvernance

1. **Finalité exacte à arrêter** : l'établissement doit documenter ce que l'application permet de faire et ce qu'elle ne doit pas devenir. Exemple de formulation de travail : suivi des dégradations matérielles, des faits associés strictement nécessaires et des mesures de réparation.
2. **Base légale à confirmer** par le responsable de traitement et le DPD. Ne pas ajouter de pseudo-consentement dans l'application sans validation : dans l'Éducation nationale, de nombreux traitements de gestion reposent sur une mission d'intérêt public.
3. **Fiche au registre des activités de traitement** : catégories de personnes, données, destinataires, finalité, durée de conservation, sécurité, transferts éventuels.
4. **Information des personnes concernées** : finalité, responsable, base légale, données, destinataires, durée, droits et contact DPD.
5. **Durée de conservation** : elle ne peut pas rester indéfinie. La valeur doit être décidée et documentée avant d'automatiser un archivage ou un effacement.
6. **Criblage AIPD** avec le DPD. Les mineurs constituent une population vulnérable au sens de l'analyse des risques, mais l'application ne déclare pas d'elle-même qu'une AIPD complète est juridiquement obligatoire.

Références :

- CNIL — Registre des activités de traitement : https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement
- CNIL — Durées de conservation : https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
- CNIL — AIPD : https://www.cnil.fr/fr/definition/analyse-dimpact-aipd

### P0 — Sécurité du poste

Le stockage local réduit fortement l'exposition réseau mais reporte la sécurité sur le PC. Avant production :

- compte Windows nominatif et verrouillage automatique de session ;
- chiffrement du poste (BitLocker / chiffrement de l'appareil selon l'équipement) à vérifier avec l'administrateur ;
- correctifs Windows et antivirus gérés ;
- droits utilisateur non administrateur si possible ;
- procédure de réaffectation / mise au rebut du poste avec effacement sécurisé ;
- sauvegarde externe définie et protégée contre la perte ou le vol.

Référence : CNIL — Sécuriser les postes de travail : https://www.cnil.fr/fr/securite-securiser-les-postes-de-travail

### P1 — Cycle de vie des dossiers

À ajouter après validation de la durée :

- date de clôture explicite ;
- tableau « dossiers à réexaminer » ;
- archivage / anonymisation / suppression contrôlée selon la politique retenue ;
- journal minimal des opérations de purge, sans recopier le contenu des dossiers.

### P1 — Droits des personnes

À prévoir :

- export ciblé des informations concernant une personne ;
- procédure documentée de rectification ;
- procédure d'effacement lorsque le droit est applicable ;
- protection des informations concernant des tiers lors d'un export.

Référence : CNIL — Droit d'accès : https://www.cnil.fr/fr/respecter-les-droits-des-personnes/professionnels-comment-repondre-une-demande-de-droit-dacces

### P1 — Sauvegardes

Les sauvegardes actuelles sont cohérentes mais restent sur le même PC. Elles protègent contre une erreur applicative, pas contre la panne ou le vol du disque. La version de production devra disposer d'un export de sauvegarde **chiffré**, vérifiable et restaurable, avec test de restauration périodique.

## 4. Minimisation recommandée

Principe : ne pas collecter une donnée « au cas où ».

- identité élève : facultative dans l'interface ;
- classe : facultative ;
- personne ayant signalé : facultative ;
- famille : retirée du formulaire ;
- photographie : seulement si elle apporte une preuve utile ;
- texte libre : rester factuel, éviter appréciations, rumeurs ou détails non nécessaires ;
- données sensibles (santé, religion, opinions, origine, vie sexuelle, etc.) : ne pas utiliser cette application pour les stocker.

Référence : CNIL — Minimiser les données collectées : https://www.cnil.fr/fr/minimiser-les-donnees-collectees

## 5. Risques spécifiques photos

Une photo JPEG peut embarquer des métadonnées EXIF contenant notamment des informations sur l'appareil et parfois des coordonnées GPS. V5.0.1 supprime les segments APP1 (EXIF/XMP), APP13 (IPTC) et COM avant stockage. Le nom original du fichier n'est pas conservé non plus.

Le besoin de conserver une photo doit néanmoins être apprécié dossier par dossier : l'assainissement des métadonnées ne transforme pas une photo identifiable en donnée anonyme.

## 6. Production gate

La version ne doit pas être qualifiée « production RGPD validée » tant que les cases suivantes ne sont pas formellement satisfaites :

- [ ] finalité validée par le responsable de traitement ;
- [ ] base légale documentée ;
- [ ] traitement inscrit ou rattaché au registre ;
- [ ] DPD consulté ;
- [ ] criblage AIPD documenté ;
- [ ] catégories de données validées ;
- [ ] destinataires / habilitations définis ;
- [ ] durée de conservation définie ;
- [ ] mention d'information prête ;
- [ ] chiffrement du poste vérifié ;
- [ ] verrouillage automatique Windows vérifié ;
- [ ] sauvegarde externe chiffrée et restauration testée ;
- [ ] procédure de violation de données connue ;
- [ ] test fonctionnel et test de charge passés sur le poste cible.

## 7. Conclusion technique intermédiaire

Le choix **local-first, mono-utilisateur, sans backend cloud** est cohérent avec une stratégie de minimisation de surface d'exposition. Il ne suffit toutefois pas à garantir la conformité : la gouvernance du traitement, la durée de conservation, l'information des personnes, les habilitations et la sécurité du poste restent déterminantes.

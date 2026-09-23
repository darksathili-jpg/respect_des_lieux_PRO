# Audit V5.2 — Professional Desktop Qualification

Date de référence : 23 septembre 2026.

Cet audit qualifie **la robustesse technique, le packaging Windows et la parité fonctionnelle** de Respect des Lieux PRO. Il complète l'audit de protection des données `AUDIT-RGPD-V5.md` et ne remplace pas la validation du traitement par l'établissement et le DPD.

## 1. Qualification automatisée acquise

La V5.2 dispose désormais de deux portes CI Windows :

- `V5 Local Reliability Gate` : syntaxe, SQLite, confidentialité, sécurité et régressions ;
- `V5.2 Windows Professional Qualification` : installation des dépendances épinglées, tests complets, construction NSIS x64 et conservation de l'installateur comme artefact de qualification.

Le workflow de qualification produit un installateur **non signé**. Il s'agit d'une build de test, pas encore d'une distribution institutionnelle de production.

## 2. Robustesse locale ajoutée en V5.2

### Volume

La CI génère et éprouve :

- 5 000 signalements ;
- 10 000 réparations ;
- une fenêtre de lecture de 500 signalements / 1 000 réparations ;
- `PRAGMA quick_check` après charge.

La contrainte de temps du test porte sur la lecture de la fenêtre métier, pas sur la génération initiale de la fixture.

### Fermeture brutale

Deux scénarios sont automatisés :

1. écriture transactionnelle validée, puis arrêt brutal du processus : la donnée doit être présente et la base intègre à la réouverture ;
2. transaction interrompue avant `COMMIT` : l'écriture doit être annulée à la réouverture.

Ces tests qualifient le comportement WAL/transactionnel face à un crash de processus. Ils ne prétendent pas simuler une panne matérielle totale pendant l'écriture physique du support.

### Espace disque et photos

Le coffre photo :

- limite chaque JPEG à 3 Mo ;
- retire les métadonnées ;
- refuse un doublon SHA-256 dans un même dossier ;
- limite le dossier à 2 photos ;
- contrôle l'espace libre avant écriture et conserve une réserve de 64 Mo.

Cette pré-vérification réduit le risque de remplissage du disque ; elle ne remplace pas l'épreuve sur un vrai volume presque plein.

## 3. Packaging Windows

Les versions critiques de construction sont épinglées :

- Electron 44.4.0 ;
- electron-builder 26.16.1 ;
- Node 24.21 dans les workflows.

Le packaging active des Electron Fuses de durcissement, notamment :

- `runAsNode: false` ;
- `enableNodeOptionsEnvironmentVariable: false` ;
- `enableNodeCliInspectArguments: false` ;
- validation d'intégrité ASAR ;
- chargement uniquement depuis ASAR ;
- absence de privilèges supplémentaires du protocole `file:`.

Le workflow impose `--publish never` : aucune build de qualification n'est publiée automatiquement.

## 4. Audit de parité avec V4.3

La comparaison avec la V4.3 met en évidence des fonctions présentes dans la version historique qui ne sont pas encore reprises ou suffisamment abouties dans V5.2.

| Fonction | V4.3 | V5.2 | Qualification |
|---|---|---|---|
| Création signalement | oui | oui | acquise |
| Réparations multiples | oui | oui | acquise |
| Photos | oui | oui, coffre renforcé | acquise côté stockage |
| Recherche textuelle | oui | oui, signalements | partielle |
| Filtres gravité/statut/lieu/date | oui | non complets | à reprendre |
| Filtres réparations statut/référent/date | oui | non complets | à reprendre |
| Tri par colonnes | oui | non | à reprendre |
| Pagination visible | oui | non | à reprendre |
| Avertissement fenêtre 500/1000 | n/a | non explicite | à ajouter |
| KPIs graves / clôture / taux résolution | oui | partiels | à reprendre |
| Graphiques lieu/type | oui | non | à reprendre |
| Évolution 8 mois | oui | non | à reprendre |
| Export CSV | oui | non | à reprendre avec minimisation |
| Export JSON général | oui | remplacé par revue ciblée | décision de conception à formaliser |
| Fiche de réparation éducative imprimable | oui | non | à reprendre avant parité |
| Charte imprimable | oui | non | à décider : métier ou document annexe |
| Galerie photo / consultation intégrée | partielle | IPC disponible mais UX incomplète | à reprendre |
| Offline / réseau | cloud + file d'attente | local natif | V5 supérieure pour mono-poste |
| Cycle de vie / purge / restauration chiffrée | limité | renforcé | V5 supérieure |

### Décision de qualification

La V5.2 est **techniquement qualifiée comme prototype desktop installable**, mais **pas encore qualifiée en parité fonctionnelle V4.3**. La prochaine passe UI ne doit donc pas ajouter de nouvelles données personnelles ; elle doit d'abord restaurer les fonctions de consultation et de pilotage utiles de V4.3.

## 5. Écarts UX prioritaires

### P0 — avant test utilisateur réel

1. Transformer le bouton photo en véritable gestionnaire : voir les photos existantes, ouvrir, ajouter jusqu'à la limite, éviter qu'un clic serve uniquement à joindre un nouveau fichier.
2. Signaler clairement lorsque la fenêtre locale de 500/1 000 lignes est atteinte afin d'éviter de faire croire que le tableau représente toute la base.
3. Reprendre filtres, tri et pagination accessibles de V4.3.
4. Restaurer la fiche éducative imprimable si elle fait partie du processus réel de l'établissement.
5. Ajouter une gestion d'erreur explicite et non destructive pour espace disque insuffisant et sauvegarde impossible.

### P1 — parité métier

1. KPIs complets ;
2. graphiques lieu/type et évolution mensuelle ;
3. export CSV contrôlé avec rappel de confidentialité ;
4. filtres avancés des réparations ;
5. épreuve d'impression ;
6. audit clavier, contrastes, zoom 125/150 %, résolution 1366×768 et écran haute densité.

## 6. Verrous de production restants

Même avec une CI verte et un installateur construit, la mise en production reste fermée tant que ne sont pas passés :

- installation réelle sur le PC cible ;
- lancement après installation puis après redémarrage Windows ;
- essai avec compte Windows non administrateur ;
- verrouillage de session et chiffrement du poste vérifiés avec l'administration ;
- vrai scénario `sauvegarde externe → perte simulée du dossier local → restauration → contrôle métier` ;
- épreuve sur disque presque plein ;
- audit visuel/ergonomique et accessibilité ;
- parité métier décidée avec V4.3 ;
- choix de signature de code ou de méthode de déploiement institutionnelle ;
- validation du Production Gate établissement / DPD.

## 7. Position de release

**V5.2.0-alpha.1 = build de qualification Windows.**

Elle peut être installée sur un poste de test avec des données fictives pour l'épreuve terrain. Elle ne doit pas encore remplacer la V4.3 active ni recevoir des données réelles tant que les verrous de production ci-dessus ne sont pas levés.

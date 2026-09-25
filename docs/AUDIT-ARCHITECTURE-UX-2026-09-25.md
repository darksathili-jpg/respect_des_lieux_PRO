# Audit drastique architecture / UX — 25 septembre 2026

## Décision

La chaîne de correctifs incrémentaux est arrêtée. `5.2.1-alpha.6` reste la dernière prerelease autorisée tant que les critères de reconstruction décrits ici ne sont pas satisfaits. Aucun nouvel EXE ne doit être publié sur la base de l'architecture UI actuelle.

## Constat racine

L'application mélange actuellement deux systèmes de rendu dans le même document :

1. `#vf-dashboard`, conçu initialement comme surface de fidélité visuelle ;
2. `.shell`, qui contient les vraies vues métier et leurs contrôles.

Le CSS de Phase C tente ensuite de conserver la navigation du premier tout en affichant le contenu du second. Cette superposition est une dette d'architecture : elle crée des contextes de positionnement et de z-index concurrents, multiplie les règles de masquage, duplique les responsabilités de navigation et rend les comportements responsive difficiles à raisonner.

Le Visual Fidelity Gate actuel possède aussi un biais majeur : son mode `RDL_VISUAL_TEST` rend une surface différente de la production et utilise des tranches de `design/reference/dashboard-master.png` comme arrière-plans. Comparer cette surface au même master ne qualifie donc pas le renderer de production.

Les défauts observés par l'utilisateur (illustrations absentes, ancien shell qui réapparaît, catégories erronées, modale difficile à quitter, réparation non éditable, bandeau qui masque son contenu) sont cohérents avec ces deux erreurs de conception.

## Principes de reconstruction non négociables

### 1. Une seule shell de production

Le DOM de production ne doit contenir qu'une seule structure d'application :

- `AppShell`
- `TopBar`
- `SideNav`
- `MainRegion`
- une vue métier active dans `MainRegion`

Aucun second menu, aucune ancienne shell masquée, aucun dashboard parallèle ne doit rester dans le DOM.

### 2. La maquette n'est jamais une interface

`dashboard-master.png` devient uniquement une référence documentaire / baseline de conception. Il est interdit de l'utiliser comme background, sprite, faux contrôle, faux texte ou tranche de l'interface runtime.

Les illustrations doivent être de vrais assets autonomes (`svg`, `webp`) avec :

- dimensions intrinsèques connues ;
- `object-fit` / `background-size` explicites ;
- fallback visuel sobre ;
- test de décodage ;
- test de peinture de la région concernée dans le binaire empaqueté.

### 3. Un design system explicite

Les CSS historiques (`styles.css`, `v51.css`, `dashboard-vf.css`, `detail.css`) doivent être remplacés progressivement par une structure ordonnée :

- `tokens.css` : couleurs, typographies, espacements, rayons, ombres ;
- `base.css` : reset et éléments HTML ;
- `layout.css` : shell et régions ;
- `components.css` : boutons, cartes, tableaux, badges, dialogues ;
- `views.css` : uniquement les variations propres aux vues.

La cascade doit utiliser `@layer` pour rendre l'ordre explicite et supprimer les dépendances à `!important`. Les composants adaptatifs doivent préférer les container queries lorsque leur mise en page dépend de leur propre largeur.

### 4. Les fonctionnalités sont définies avant l'interface

Une matrice de capacités doit exister pour chaque entité. Pour `Signalement` et `Réparation`, les opérations autorisées doivent être déclarées et couvertes de bout en bout. Une fonctionnalité affichée sans service métier correspondant est interdite ; inversement, une donnée modifiable métier doit avoir un parcours d'édition défini.

La modification d'une réparation devra être implémentée directement dans la couche de domaine / base de données et via un canal IPC dédié (`rdl:reparations:update`). Le monkey-patch provisoire introduit pendant le diagnostic n'est pas une architecture acceptable et ne doit pas être livré.

### 5. Un composant Dialog unique

Toutes les modales doivent utiliser le même contrat :

- titre visible et `aria-labelledby` ;
- focus placé dans le dialogue à l'ouverture ;
- focus confiné tant que la modale est ouverte ;
- bouton de fermeture visible et dans l'ordre de tabulation ;
- bouton Annuler/Fermer explicite ;
- `Escape` fonctionnel ;
- retour du focus vers l'élément déclencheur ;
- contenu long scrollable sans masquer l'en-tête ni les actions ;
- comportement vérifié à la souris et au clavier.

### 6. Responsive défini par des invariants

Le responsive ne sera plus validé par « absence d'erreur ». Les invariants de chaque composant sont mesurés :

- aucun débordement horizontal non prévu ;
- aucune intersection entre titre, décor, actions et navigation ;
- zone principale toujours contenue dans la fenêtre ;
- barre latérale et contenu sans recouvrement ;
- tailles minimales des zones interactives ;
- tableaux explicitement scrollables si nécessaire.

Tailles Windows à qualifier au minimum : 1024×768, 1280×720, 1366×768, 1440×900, 1920×1080, plus mise à l'échelle système 100 %, 125 % et 150 % lorsque le runner le permet.

### 7. Les tests portent sur la production réelle

Le mode UI alternatif `RDL_VISUAL_TEST` ne peut plus servir de preuve de qualité produit.

Les tests visuels doivent :

- lancer le vrai binaire empaqueté en mode production ;
- injecter uniquement des données de fixture déterministes, jamais une autre UI ;
- capturer chaque vue réelle ;
- comparer les screenshots dans un environnement Windows épinglé ;
- conserver les diffs comme artefacts CI.

Les tests d'interaction doivent reproduire les parcours réels : ouvrir/fermer une fiche, créer puis modifier une réparation, naviguer dans les six destinations, sauvegarder/restaurer sur fixture, redimensionner la fenêtre et vérifier les géométries critiques.

### 8. Sécurité Electron conservée et renforcée

Les protections déjà présentes (context isolation, sandbox, nodeIntegration désactivé, validation de l'émetteur IPC, navigation et nouvelles fenêtres limitées, CSP, réseau distant bloqué) sont conservées.

Une migration de `file://` vers un protocole applicatif local dédié (`app://`) doit être étudiée puis qualifiée, conformément aux recommandations Electron, afin de limiter les privilèges particuliers du protocole fichier.

### 9. SQLite : contrat clair

La base reste locale, transactionnelle et sauvegardée. `STRICT`, WAL, `synchronous=FULL`, les clés étrangères et les contrôles d'intégrité sont conservés. Le recours à `node:sqlite` doit être suivi car le module est encore classé Release Candidate dans Node 24.21. Les opérations synchrones longues doivent être mesurées ; si elles peuvent bloquer le processus principal, elles devront être isolées.

## Nouvelle chaîne de qualité

Une release n'est autorisée que si les niveaux suivants sont tous verts :

1. syntaxe et lint structurel ;
2. tests domaine / base / sauvegardes ;
3. sécurité Electron / IPC / CSP ;
4. contrat fonctionnel CRUD ;
5. tests composants UI ;
6. accessibilité clavier/dialogues ;
7. E2E sur vrai EXE empaqueté ;
8. responsive multi-viewport ;
9. régression visuelle des vraies vues de production ;
10. packaging NSIS ;
11. revue des artefacts visuels avant publication.

## Références techniques de base

- Electron Security Tutorial — https://www.electronjs.org/docs/latest/tutorial/security
- WAI-ARIA APG Modal Dialog Pattern — https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Playwright Visual Comparisons — https://playwright.dev/docs/test-snapshots
- MDN Container Queries — https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
- Node.js 24 SQLite — https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html

## Ordre de reconstruction

Phase R0 — geler les releases et supprimer les preuves de qualité trompeuses.

Phase R1 — extraire une shell unique et faire fonctionner les six routes sans duplication de DOM.

Phase R2 — reconstruire le design system et migrer l'Accueil avec les vrais assets.

Phase R3 — migrer Signalements + composant Dialog puis Réparations avec CRUD complet.

Phase R4 — migrer Sauvegardes, Protection des données et Système local.

Phase R5 — remplacer les anciens visual gates par des E2E et visual regressions de production multi-viewport.

Phase R6 — qualification complète, audit sécurité final, puis seulement création d'une nouvelle prerelease.

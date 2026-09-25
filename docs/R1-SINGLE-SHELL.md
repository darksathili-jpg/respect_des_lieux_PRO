# R1 — Single Shell Reconstruction

## Statut

Branche de reconstruction : `r1-single-shell`.

La release reste gelée. R1 n'est pas une nouvelle version distribuable : c'est une reconstruction de la fondation UI qui doit être qualifiée avant toute fusion dans `main`.

## Objectif

Supprimer définitivement la coexistence de deux interfaces et obtenir une architecture où toutes les fonctions métier sont rendues dans une seule structure :

- `#app-shell`
- une sidebar
- `#main-region`
- six destinations
- une seule vue active à la fois

Les six destinations sont : Accueil, Signalements, Réparations, Sauvegardes, Protection des données et Système local.

## Ce que R1 supprime

- `#vf-dashboard` ;
- `renderer/dashboard-vf.css` ;
- `RDL_VISUAL_TEST` et `visual-test-mode` ;
- les tranches de `dashboard-master.png` utilisées comme interface ;
- les deux WebP dérivés de la capture maître dans l'arbre runtime ;
- la logique qui masquait une shell pour en afficher une autre ;
- les tests qui validaient une interface alternative au produit réellement utilisé.

La référence de conception peut rester dans `design/`, mais `design/**` est exclu du package Electron.

## Contrat de navigation

`renderer/app.js` porte désormais un contrat DOM explicite. Au démarrage il vérifie :

1. une et une seule `#app-shell` ;
2. une et une seule `#main-region` ;
3. exactement six boutons de navigation ;
4. exactement six panneaux métier ;
5. une correspondance univoque entre destination et panneau ;
6. la présence des contrôles structurants.

La navigation ne change plus de shell. Elle modifie uniquement `hidden`, `.active` et `aria-current` sur les composants de l'unique application.

## Deux défauts fonctionnels détectés pendant R1

R1 a également révélé deux défauts silencieux qui n'étaient pas des problèmes graphiques :

- le bouton « Créer une sauvegarde maintenant » de la vue Sauvegardes n'était pas relié au service de sauvegarde ;
- `renderPrivacyEvents()` écrivait dans `#privacy-events-body`, alors que le document contenait `#privacy-events`.

Ces deux branchements sont maintenant explicites et couverts par les garde-fous R1.

## Qualification

Le smoke gate Windows ne connaît plus la maquette graphique. Il lance le vrai binaire empaqueté, attend `data-shell-ready="true"`, vérifie l'unicité de la shell et de la région principale, puis clique successivement sur les six destinations. Pour chaque étape il exige :

- une seule navigation active ;
- un seul panneau actif et visible ;
- `aria-current="page"` sur la bonne destination ;
- aucune résurrection de l'ancienne shell ;
- une géométrie cohérente entre sidebar et contenu ;
- aucune barre de défilement horizontale globale ;
- une surface réellement peinte.

Le précédent gate qui comparait une interface de qualification à `dashboard-master.png` est retiré. Une nouvelle régression visuelle de production sera introduite en R5, sur le vrai renderer et avec des fixtures déterministes.

## Dette volontairement non absorbée par R1

R1 ne doit pas devenir une nouvelle phase de patchs. Le mécanisme temporaire d'édition des réparations (`reparation-edit-extension.cjs` et `_repair_id`) est conservé uniquement pour ne pas casser une capacité existante pendant la reconstruction de shell. Il n'est pas considéré comme l'architecture cible.

Sa suppression et son remplacement par un vrai contrat domaine → SQLite → IPC dédié → UI appartiennent à R3. La release restera gelée tant que cette dette et les autres critères du fichier `quality/release-state.json` ne seront pas levés.

## Suite

Après validation CI de R1 :

- R2 : design system explicite et migration visuelle de l'Accueil avec de vrais assets ;
- R3 : Signalements, Dialog unique, Réparations et CRUD propre ;
- R4 : Sauvegardes, Protection des données, Système local ;
- R5 : E2E et régression visuelle du vrai produit multi-viewport ;
- R6 : qualification finale puis seulement décision de lever le gel de release.
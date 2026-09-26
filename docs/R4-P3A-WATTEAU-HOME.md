# R4-P3a — Accueil Visual Fidelity Watteau

## Objectif

Retrouver l’impact visuel de la référence Watteau sans réintroduire de contenu fictif et sans modifier le socle métier qualifié R4-P2.

## Règles de production

- une seule AppShell de production ;
- navigation réelle : Accueil, Signalements, Réparations, Sauvegardes, Protection des données, Système local ;
- aucune persona, météo, date décorative ou métrique inventée ;
- aucun `dashboard-master.png`, `visual-test-mode` ou capture utilisée comme interface ;
- assets autonomes `watteau-sidebar-mark.svg` et `watteau-home-hero.svg` ;
- titre de hero : **Bonjour !** ;
- sous-titre : **Ensemble, prenons soin de notre lycée.** ;
- stockage local présenté comme information secondaire ;
- chemin Windows de la base non affiché sur l’Accueil ;
- KPI alimentés uniquement par les données réelles ;
- release publique gelée.

## Frontière avec R4-P2

La phase P3a peut faire évoluer le Design System partagé (`tokens.css`, `layout.css`, `home.css`, import `styles.css`) mais ne peut pas modifier le runtime Réparations qualifié en P2. Le workflow dédié compare les fichiers métier critiques au commit P2 `a20bff033452207b5b93f3af4296981bca2a308e`.

## Visual Evidence Gate

Le véritable EXE Electron empaqueté doit produire et valider :

- `home-desktop-1440x900.png` ;
- `home-reduced-1024x720.png` ;
- `home-compact-760x760.png` ;
- `home-desktop-keyboard-focus.png`.

Les mesures exigent notamment : aucune largeur document débordante, une seule shell, quatre KPI visibles, assets Watteau réellement peints, focus visible, absence de contenu fictif et panneaux dans la largeur utile.

## Preuve candidate avant qualification transversale finale

Le Visual Gate dédié a passé le run `36261678280` sur le commit `a64a88f362f4753e08a0c81974e8053813ad1197` ; artefact `10913155424`, SHA-256 `c9a9692eabe04a4a0ac3d4ac3b85edada818c4cb970aec9607bfc6b01a0158eb`.

Cette preuve reste **candidate** tant que le commit final commun aux branches R4 et R4-P3a n’a pas repassé le Visual Gate et les gates transversaux.

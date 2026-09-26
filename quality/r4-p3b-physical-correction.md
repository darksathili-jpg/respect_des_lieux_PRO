# R4-P3b — Corrective après validation physique

## Défaut observé

Le test physique R4-P3a du 26 septembre 2026 a révélé une dérive horizontale du viewport sur une fenêtre large : la sidebar Watteau était partiellement hors écran à gauche alors que la zone principale restait rendue.

## Cause couverte

Le contrôle précédent vérifiait l'absence d'overflow global mais ne vérifiait pas explicitement l'origine horizontale réelle du viewport. Chromium peut conserver ou provoquer un `scrollX` non nul dès qu'une surface déborde, y compris lorsque la composition principale elle-même respecte sa largeur.

## Corrective structurelle

R4-P3b met en place deux barrières indépendantes :

- `html/body` sont verrouillés et la shell devient l'unique scroller vertical de l'application ;
- le bootstrap Electron installe un garde d'origine horizontale qui ramène immédiatement le root viewport à `x = 0` si Chromium tente de le déplacer.

Les scrolls horizontaux locaux des composants métier, notamment les tables, restent indépendants.

## Gate adversarial permanent

`scripts/r4-p3b-horizontal-drift-gate.mjs` éprouve le vrai EXE empaqueté sur :

- 1768×1005, profil dérivé de la capture physique ;
- 1440×900 ;
- 1240×800 ;
- 1024×720 ;
- 760×760.

Le gate vérifie la position de la shell et de la sidebar, la largeur attendue de la sidebar, la jointure sidebar/main, la visibilité des libellés de navigation et `scrollX = 0`. Il crée ensuite artificiellement un débordement de 400 px et tente `window.scrollTo(180, ...)` : l'acceptation exige que le viewport reste à `x = 0`.

## Preuve qualifiée sur la branche visuelle

Commit source : `10d441bce8bc3f5aea80806c4e26738ac49b179b`.

Visual Gate : run `36263467557`.

Résultat adversarial :

- physical-wide 1768 : sidebar 274 px, `scrollX=0`, `forcedScrollX=0` ;
- desktop 1440 : sidebar 274 px, `scrollX=0`, `forcedScrollX=0` ;
- breakpoint 1240 : sidebar 244 px, `scrollX=0`, `forcedScrollX=0` ;
- reduced 1024 : sidebar 216 px, `scrollX=0`, `forcedScrollX=0` ;
- compact 760 : `scrollX=0`, `forcedScrollX=0`.

Cette corrective ne modifie pas le runtime métier R4-P2 : base SQLite, domaine Réparations, preload, main process métier et renderer Réparations restent figés.

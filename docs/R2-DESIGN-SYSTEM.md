# R2 — Design System + Accueil

## Principe

R2 reconstruit l'apparence sans réintroduire de shell parallèle, de capture maître dans le runtime ni de mode visuel alternatif. La structure fonctionnelle R1 reste la seule structure de production.

## Cascade de production

`renderer/styles.css` est l'unique point d'entrée historique et charge, dans cet ordre :

1. `tokens.css` — couleurs, typographie, espacements, rayons, ombres, focus et mouvements ;
2. `components.css` — boutons, panneaux, statuts, formulaires, tableaux, dialogues et états ;
3. `layout.css` — AppShell, navigation, topbar, vues et replis responsive ;
4. `home.css` — composition spécifique de l'Accueil et intégration des assets de production.

`v51.css` ne contient plus que les extensions fonctionnelles V5.1 qui ne font pas partie du système commun.

## Assets

Les seuls visuels utilisés par R2 sont des fichiers de production autonomes :

- `renderer/assets/sidebar-logo-production.svg` ;
- `renderer/assets/dashboard-hero-production.svg`.

La capture `design/reference/dashboard-master.png` reste une référence de conception exclue du binaire. Elle ne doit jamais être appelée depuis HTML, CSS ou JavaScript.

## Accessibilité minimale bloquante

- focus clavier explicite via `:focus-visible` ;
- tailles de contrôles principales d'au moins 42 px ;
- contraste renforçable avec `prefers-contrast: more` ;
- support `forced-colors` ;
- suppression des transitions avec `prefers-reduced-motion: reduce` ;
- navigation active exposée par `aria-current="page"` ;
- six vues toujours pilotées par `hidden` et la shell unique.

## Responsive

Le design n'est jamais calibré sur une largeur maître fixe. La shell se compacte à 1240/1060 px, passe en une colonne sous 820 px et l'Accueil possède ses propres replis à 1220/980/640 px.

## Gate R2

Le smoke test du véritable EXE empaqueté doit vérifier :

- la shell unique et les six vues ;
- le marqueur CSS `--rdl-ds-ready: r2` ;
- la présence calculée du logo SVG et du hero SVG ;
- l'absence de débordement horizontal global ;
- la navigation réelle dans les six vues ;
- un rendu effectivement peint.

Aucune nouvelle release n'est publiée pendant R2 : le gel reste actif jusqu'à la fin de la reconstruction.

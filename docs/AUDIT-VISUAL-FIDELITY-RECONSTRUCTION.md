# Visual Fidelity Reconstruction Gate — audit et protocole

## Décision

La tentative V5.2.1 précédente est **abandonnée comme stratégie graphique**. Elle reste dans l'historique Git mais ne constitue plus la base de la reconstruction visuelle.

Le socle technique déjà validé sur poste Windows n'est pas concerné par cet abandon : SQLite local, stockage photos, sauvegarde chiffrée, restauration, registre de purge, protections Electron et tests de fiabilité restent gelés.

Aucune réintégration dans `renderer/` n'est autorisée tant que le prototype autonome `design/prototype/dashboard.html` n'a pas franchi le Visual Fidelity Gate.

## Source de vérité

- `design/reference/dashboard-master.png`
- dimensions : **1448 × 1086 px**
- SHA-256 attendu : `1106a0bcbc52d34ef6ea95f56ac999b2abc228034bd1a673023d3c761f155944`
- blob Git correspondant au visuel validé : `594bb2fc8d1bbaf5b2a09032bcfb26c12ee3e542`

Le workflow refuse de poursuivre si le hash du master change sans validation explicite.

## Diagnostic de l'échec alpha.3

### 1. Empilement de couches graphiques

L'interface historique est mise en forme par plusieurs mécanismes simultanés : `styles.css`, `v51.css`, `theme-v521.js`, `fidelity-master-v521.css`, `fidelity-master-v521.js`, `parity-v521.js` et les styles de fiche. Le preload injecte plusieurs de ces couches après le chargement du document.

Conséquence : la géométrie finale dépend de l'ordre de chargement et de la spécificité CSS, ce qui rend une reproduction fidèle très difficile à maîtriser.

### 2. CSS dynamique incompatible avec la politique de sécurité

`renderer/index.html` conserve une CSP stricte avec `style-src 'self'`. Or `theme-v521.js` créait un élément `<style>` à l'exécution. La nouvelle reconstruction n'utilise **aucun style inline injecté par JavaScript** et ne demande aucun affaiblissement de la CSP.

### 3. Le smoke test ne mesurait pas la fidélité

Le contrôle empaqueté vérifiait qu'un DOM existait et qu'une capture contenait une plage de couleurs suffisamment variée. Une interface gravement déformée pouvait donc être déclarée « rendue ».

Le nouveau gate compare désormais une capture réelle à la source de vérité avec Playwright/pixelmatch.

### 4. Géométrie non calibrée sur la maquette

Mesures du master utilisées comme constantes de reconstruction Phase A :

- canvas : `1448 × 1086`
- séparation sidebar/main : `x = 362`
- topbar : `77 px`
- sidebar : `362 × 1009` à partir de `y = 77`
- main : `1086 × 1009` à partir de `x = 362`, `y = 77`
- hero : `1086 × 323`
- première carte KPI : `x = 376`, `y = 412`, `242 × 165`
- 4 KPI : `242 px` chacun, gap `13 px`
- zone basse : 2 colonnes `512 px / 482 px`, gap `15 px`

Ces mesures remplacent les valeurs approximatives et les `clamp()` de la tentative précédente.

## Méthode Phase A

Le prototype est volontairement séparé de l'application :

- `design/prototype/dashboard.html`
- `design/prototype/dashboard.css`

Règles :

1. aucun accès SQLite ;
2. aucune API Electron ;
3. aucun JavaScript nécessaire au rendu ;
4. aucune ressource distante ;
5. aucune injection CSS ;
6. viewport fixe `1448 × 1086` pendant la calibration ;
7. les zones illustrées complexes et statiques du master peuvent être exploitées comme **sprite local** provenant du master validé ;
8. les cartes et informations destinées à redevenir dynamiques restent du vrai HTML/CSS.

Cette approche sépare les deux problèmes : fidélité graphique d'abord, branchement métier ensuite.

## Visual Fidelity Gate

Le workflow `.github/workflows/visual-fidelity-gate.yml` s'exécute sur `windows-latest` avec Playwright `1.63.0` et Chromium.

Il vérifie :

- l'identité SHA-256 du master ;
- la géométrie structurante ;
- une capture réelle du canvas ;
- une comparaison pixel à pixel avec `dashboard-master.png`.

Seuil Phase A : `maxDiffPixelRatio = 0.08`, `threshold = 0.15`.

Ce seuil ne signifie pas « 92 % de qualité subjective ». Il interdit simplement qu'une proportion supérieure à 8 % des pixels diverge au-delà de la tolérance colorimétrique configurée. Toute réintégration Electron est bloquée tant que ce test n'est pas vert.

## Ce qui est explicitement interdit avant PASS

- modifier `src/database.cjs`, `src/storage.cjs` ou `src/portable-backup.cjs` pour des raisons graphiques ;
- réécrire le système de sauvegarde/restauration ;
- réactiver une couche de thème injectée dynamiquement ;
- publier une nouvelle release Windows présentée comme refonte fidèle ;
- utiliser des données réelles d'élèves pendant cette qualification.

## Après PASS uniquement

1. intégrer la structure HTML/CSS validée dans le renderer Electron ;
2. remplacer les valeurs statiques par les données locales sans modifier la géométrie ;
3. refaire la capture dans **l'application Electron empaquetée** ;
4. ajouter un second Visual Fidelity Gate Electron ;
5. seulement ensuite étendre la charte aux écrans Signalements, Interventions, Suivi, Établissement et Paramètres.

## Références techniques retenues

- Playwright Visual Comparisons / `toHaveScreenshot()` : comparaison par screenshots et `pixelmatch`, à exécuter dans un environnement stable.
- Playwright Electron : automatisation possible de la vraie fenêtre Electron pour le futur gate d'intégration.
- Electron Security : conservation d'une CSP stricte ; aucune raison graphique ne justifie de la relâcher.

# R3 — Audit fonctionnel exhaustif de Signalements

## Statut

- Branche : `r3-signalements`
- Base R2 fusionnée : `dafca10ea52becedb688e35d1566abf1f280b3c2`
- Release : **gelée**
- Règle R3 : **aucun CSS spécifique Signalements avant validation du socle fonctionnel**.

## Objectif

Reconstruire le parcours Signalements comme une fonctionnalité métier complète et testable avant de travailler son apparence. Le chemin de référence devient :

`contrat métier → validation des données → SQLite → IPC → preload → contrôleur renderer → interaction clavier/souris → vrai EXE → seulement ensuite UI spécifique`.

## Sources techniques de référence

- HTML `<button>` : un bouton rattaché à un formulaire est `submit` par défaut si son `type` n’est pas précisé. MDN : https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button
- HTML `<dialog>` : fermeture explicite via `formmethod="dialog"`, `close()` ou Escape. MDN : https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
- WAI-ARIA Dialog Modal Pattern : focus initial interne, confinement du focus, Escape, retour du focus et contrôle visible de fermeture. https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Electron Security : validation systématique de l’émetteur IPC. https://www.electronjs.org/docs/latest/tutorial/security
- SQLite STRICT/CHECK : STRICT rigidifie les types, mais les invariants métier doivent être exprimés par validation et/ou contraintes `CHECK`. https://www.sqlite.org/stricttables.html et https://sqlite.org/lang_createtable.html

## État actuel de la chaîne fonctionnelle

### Création

**Partielle / bloquante.**

Le formulaire `#signal-form` sait créer un dossier et la base assure une numérotation annuelle transactionnelle. Mais les boutons `×` et `Annuler` sont dans un formulaire et ne déclarent pas `type="button"`. Comme `<button>` vaut `submit` par défaut, ils peuvent déclencher validation/soumission au lieu de fermer proprement. C’est la cause conceptuelle du comportement observé où l’utilisateur ne pouvait sortir du dialogue qu’avec Échap.

Le handler `submit` ne distingue pas le `SubmitEvent.submitter`. Il n’existe pas non plus de verrou anti-double soumission pendant l’appel IPC.

### Lecture / liste

**Partielle.**

`listSignalements()` plafonne à 500 lignes. `reload()` demande 5000 mais la couche SQLite ramène malgré tout 500 éléments. La recherche est ensuite purement côté renderer : un dossier au-delà de cette fenêtre devient invisible et introuvable depuis l’interface.

Le test de qualification intitulé « 5 000 signalements ... restent lisibles dans la fenêtre UI » ne teste pas l’UI : il confirme seulement que la base contient 5000 lignes tout en n’en lisant que 500. Ce test donne donc un faux sentiment de couverture.

### Fiche détaillée

**Partielle.**

La fiche possède désormais plusieurs sorties (`×`, Fermer, backdrop, Escape), ce qui est sain. En revanche, pour ouvrir un dossier par id elle recharge jusqu’à 500 signalements, jusqu’à 1000 réparations, puis filtre en mémoire. Il n’existe pas d’IPC dédié `getSignalement(id)` ni de chargement ciblé des réparations du dossier.

Au-delà de 500 dossiers, une fiche peut devenir impossible à ouvrir même si le dossier existe dans SQLite.

### Modification du signalement

**Absente.**

La base expose `updateSignalement()`, mais l’interface n’offre aucun parcours d’édition des champs du dossier. Le seul usage normal de cette API côté renderer est le basculement `Ouvert ↔ Clos`.

R3 doit fournir une vraie édition contrôlée des champs autorisés, et non un patch DOM ou un deuxième formulaire parallèle.

### Statut / clôture

**Partielle.**

Le statut est un texte libre au niveau de la base et de l’API. `closed_at` n’est mis à jour que si la valeur est exactement `Clos`. Une valeur différente ou mal formée peut casser la sémantique de cycle de vie.

La transition doit être un contrat métier explicite. Pour R3, les seuls statuts existants et autorisés restent `Ouvert` et `Clos`; aucun nouveau statut n’est inventé.

Un dossier `Clos` doit être traité comme non modifiable par les opérations métier courantes ; pour corriger le dossier il faut d’abord le rouvrir. Les opérations de confidentialité restent séparées.

### Validation des données

**Incohérente.**

La création et la modification n’appliquent pas les mêmes limites. Par exemple, `date`, `heure`, `gravite` et `statut` utilisent des tailles différentes entre création et mise à jour. Les dates/heures ne sont pas validées strictement au niveau domaine, et la gravité n’est pas bornée à la liste de l’UI.

R3 doit centraliser les validateurs et les appliquer identiquement à `create` et `update`.

### Photos

**Ajout robuste, correction incomplète.**

Points déjà solides : JPEG uniquement, 3 Mo maximum, suppression EXIF/XMP/IPTC/commentaires, réserve disque, deux photos maximum, déduplication SHA-256, stockage hors base.

Défaut majeur : on peut ajouter et ouvrir une photo, mais pas retirer individuellement une photo erronée. La seule suppression existante est la purge complète du dossier. R3 doit ajouter une suppression contrôlée d’une photo sans casser le coffre local.

### Confidentialité

**Bonne base, invariant incomplet.**

Les identités sont masquées par défaut et remasquées lors de perte de focus/visibilité. La réduction d’identifiants d’un dossier clos efface `eleve`, `classe` et `famille`.

Cependant `updateSignalement()` peut actuellement réécrire `eleve` ou `classe` même après que `identity_reduced_at` a été renseigné. C’est une violation d’invariant : une réduction ne doit jamais être annulée silencieusement par une édition standard.

Le champ `signale_par` reste une donnée potentiellement identifiante mais n’est pas supprimé par l’opération de réduction actuelle. Cette politique doit être tranchée avec la gouvernance de l’établissement ; R3 ne doit pas inventer une règle de conservation à sa place.

### Recherche

**Incomplète.**

La recherche porte sur la fenêtre locale chargée et non sur toute la base. Les identités ne sont recherchées que lorsque leur affichage est activé, ce qui est cohérent avec la minimisation visuelle mais doit devenir un paramètre explicite de la requête.

R3 doit fournir recherche + pagination côté SQLite et ne plus dépendre d’un chargement massif du registre.

### Architecture renderer

**Dette importante.**

`app.js` rend les lignes, puis `detail.js` les « décore » après coup avec `MutationObserver`, ajoute des boutons et transforme les lignes en contrôles interactifs. Ce mécanisme rend le comportement dépendant de l’ordre de rendu et peut produire des divergences entre structure et fonctionnalité.

R3 doit avoir une seule source fonctionnelle pour les contrôles Signalements. Aucun bouton métier ne doit être injecté après rendu par un observateur DOM.

### Concurrence utilisateur

**Non protégée.**

Les actions asynchrones création, clôture/réouverture, photo et réparation ne désactivent pas systématiquement leur contrôle pendant l’IPC. Un double clic peut produire deux opérations successives non voulues.

### Historique

**Minimal.**

Le dossier ne conserve que `created_at` et `updated_at`. Il n’existe pas d’historique fonctionnel minimal des transitions. R3 doit au minimum tracer sans recopier les données personnelles : création, modification (liste des champs, pas leurs anciennes valeurs), clôture, réouverture, photo ajoutée/retirée.

## Défauts classés

### P0 — bloquants avant toute UI spécifique

1. Fermeture/annulation du formulaire de création susceptible de soumettre le formulaire.
2. Aucun parcours réel de modification d’un signalement.
3. Registre/recherche/fiches limités de fait aux 500 premiers dossiers.
4. Aucun endpoint de lecture ciblée d’un dossier.
5. Aucune suppression individuelle d’une photo incorrecte.
6. Réintroduction possible de `eleve`/`classe` après réduction des identifiants.
7. Absence de validation unique des statuts et champs structurés.

### P1 — nécessaires avant qualification R3

8. Contrôles fonctionnels Signalements injectés par `MutationObserver`.
9. Absence de verrou anti-double action.
10. Politique d’édition d’un dossier clos non imposée par le domaine.
11. Aucun historique minimal des événements du dossier.
12. Pas de test E2E du vrai EXE couvrant créer → consulter → modifier → photo → clore → rouvrir.
13. Pas de test du retour de focus après fermeture d’une modale Signalements.

### P2 — dette à traiter ou documenter

14. Colonne `famille` héritée mais non utilisée par l’UI actuelle.
15. `detail.js` contient aussi une extension d’édition Réparations couplée à Signalements ; son remplacement complet relève de R4, mais R3 ne doit pas renforcer ce couplage.
16. Le champ `signale_par` nécessite une décision de gouvernance concernant la réduction d’identifiants.

## Contrat cible R3

### API domaine

R3 doit aboutir à des opérations explicites :

- `querySignalements({ query, status, includeIdentities, limit, offset })`
- `getSignalementDetail(id)`
- `createSignalement(payload)`
- `updateSignalement(id, patch)`
- `setSignalementStatus(id, status)`
- `attachPhoto(signalementId)`
- `removePhoto(photoId)`

La suppression définitive d’un dossier reste le parcours de confidentialité existant : dossier clos + saisie exacte du numéro + registre de purge.

### Invariants

- statuts autorisés : `Ouvert`, `Clos` ;
- gravités autorisées : vide, `Mineure`, `Modérée`, `Importante`, `Critique` ;
- `lieu` obligatoire ;
- date valide au format `YYYY-MM-DD` ;
- heure vide ou `HH:MM` valide ;
- dossier clos non modifiable par édition métier standard ;
- identifiants réduits non réintroduits par `updateSignalement()` ;
- maximum 2 photos, JPEG assaini ≤ 3 Mo, pas de doublon ;
- toutes les mutations asynchrones ont un état busy/idempotence UI ;
- aucune recherche ne dépend d’une fenêtre arbitraire de 500 dossiers.

## Gate de sortie avant CSS Signalements

Le travail graphique spécifique ne commence que lorsque le gate R3 fonctionnel devient vert avec :

1. création + annulation/fermeture fiables ;
2. édition complète des champs autorisés ;
3. lecture ciblée d’une fiche ;
4. recherche/pagination sur >5000 dossiers ;
5. photo ajout/retrait ;
6. confidentialité et réduction d’identité invariantes ;
7. statut contrôlé ;
8. aucun contrôle métier injecté par MutationObserver ;
9. tests domaine/IPC/renderer ;
10. parcours E2E du vrai EXE Windows.

Tant que ces dix points ne sont pas verts, toute modification de CSS spécifique à Signalements est considérée comme prématurée.

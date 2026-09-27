# R3-P2 — Audit fonctionnel Réparations

## Statut

- Base : freeze R3 Signalements `a3a9210b54967ed67bd79319d088d6a7bbc37f1d`
- Domaine Signalements : gelé, à ne pas rouvrir sauf régression prouvée.
- Domaine suivant : **Réparations**.
- Règle : aucun travail graphique spécifique Réparations avant validation du socle fonctionnel.

## Objectif

Reconstruire Réparations comme un domaine métier autonome, testable et cohérent avec les invariants R1/R2/R3 :

`contrat métier → validation → SQLite → IPC → preload → renderer → clavier/souris → EXE empaqueté → UI spécifique`.

## État constaté au 27 septembre 2026

### Création

Présente mais insuffisamment protégée.

`createReparation()` insère directement les textes après simple troncature. Les statuts ne sont pas validés par une liste métier, les dates ne sont pas validées strictement, et aucune règle n’empêche d’ajouter une réparation à un signalement clos au niveau domaine.

### Lecture

`listReparations(limit)` est plafonné à 1000 lignes. Le renderer charge actuellement jusqu’à 10 000 éléments, mais la couche SQLite n’en renvoie jamais plus de 1000.

Il n’existe pas de `getReparation(id)` ni de requête paginée/recherchable dédiée.

### Modification

Le parcours actuel n’est pas une vraie API d’update.

Dans `preload.cjs`, `updateReparation(id, payload)` invoque en réalité `rdl:reparations:create` avec un champ `_repair_id`. Le processus principal ne déclare aucun canal `rdl:reparations:update`, et `LocalDatabase` ne possède pas de méthode `updateReparation()`.

Ce contournement doit être supprimé : une modification doit être une opération métier explicite et couverte par tests.

### Renderer

`renderer/detail.js` contient encore un mécanisme de décoration post-rendu :

- `decorateRepairRows()` recharge les réparations ;
- associe les lignes par index ;
- injecte ensuite le bouton « Modifier » dans le DOM ;
- un `MutationObserver` relance cette décoration après chaque rendu.

Ce pattern a déjà été classé comme dette d’architecture pour Signalements. Réparations doit avoir une seule source de rendu et ne plus dépendre d’un enrichissement DOM asynchrone.

### Éditeur

`openRepairEditor(id)` charge jusqu’à 1000 réparations puis recherche l’identifiant en mémoire. Une réparation au-delà de cette fenêtre peut devenir non éditable.

Le dialogue d’édition réutilise le formulaire de création, ce qui est acceptable à condition que le mode create/edit soit explicite, que l’API métier soit distincte et que le focus/annulation/retour de focus soient qualifiés comme pour le composant Dialog R3.

### Cycle de vie

Les statuts visibles sont `En cours`, `Terminée`, `Annulée`, mais ils ne sont pas imposés par le domaine.

Le champ `cloture` existe dans SQLite mais n’est pas exposé dans le formulaire actuel. Il faut décider et tester la sémantique : une réparation `Terminée` doit avoir une date de clôture cohérente, sans inventer silencieusement une règle métier non validée.

### Confidentialité

`referent` est une donnée identifiante et est masqué dans l’UI globale lorsque les identités sont cachées. Le domaine Réparations doit conserver cette cohérence dans les recherches, exports de revue et détails.

## P0 — bloquants avant UI spécifique

1. Remplacer le faux update via `rdl:reparations:create` par un canal `rdl:reparations:update` dédié.
2. Ajouter `getReparation(id)` / `rdl:reparations:get` pour l’édition ciblée.
3. Centraliser la validation des champs Réparations et l’appliquer à create/update.
4. Contraindre les statuts aux valeurs autorisées : `En cours`, `Terminée`, `Annulée`.
5. Valider strictement les dates lorsqu’elles sont renseignées.
6. Refuser au niveau domaine les mutations ordinaires liées à un signalement clos.
7. Supprimer la limite fonctionnelle implicite de 1000 lignes pour les parcours de recherche/édition.
8. Supprimer l’injection de boutons Réparations par `MutationObserver`.

## P1 — nécessaires avant freeze R3 Réparations

9. Ajouter recherche + pagination côté SQLite pour le registre Réparations.
10. Rendre les actions create/update explicitement busy pour empêcher le double déclenchement.
11. Qualifier le dialogue Réparations : Escape, Annuler, bouton de fermeture, confinement du focus et retour du focus.
12. Ajouter tests domaine/IPC/preload/renderer sur création, consultation, modification et statuts.
13. Ajouter un parcours E2E sur le vrai EXE empaqueté.
14. Ajouter preuves visuelles multi-viewport seulement après le gate fonctionnel.

## Contrat cible

### API domaine

- `queryReparations({ query, status, includeIdentities, limit, offset })`
- `getReparation(id)`
- `createReparation(payload)`
- `updateReparation(id, patch)`

### IPC / preload

- `rdl:reparations:query`
- `rdl:reparations:get`
- `rdl:reparations:create`
- `rdl:reparations:update`

Aucune opération d’update ne doit transiter par le canal create.

## Invariants

- `signalement_id` pointe vers un dossier existant ;
- une mutation Réparations ordinaire est refusée si le signalement associé est clos ;
- `mesure` obligatoire ;
- statuts autorisés : `En cours`, `Terminée`, `Annulée` ;
- dates vides ou valides au format `YYYY-MM-DD` ;
- longueurs identiques entre création et modification ;
- pas de chargement massif requis pour éditer un enregistrement précis ;
- aucune action métier injectée après rendu par `MutationObserver` ;
- les identités restent masquées par défaut dans l’interface.

## Gate de sortie R3-P2

R3 Réparations ne peut être gelé que si :

1. create/get/update sont des opérations métier distinctes ;
2. validation et invariants sont centralisés ;
3. recherche/pagination fonctionnent au-delà de 1000 réparations ;
4. aucune mutation n’est possible sur dossier clos ;
5. le renderer ne dépend plus de `decorateRepairRows()` / `MutationObserver` ;
6. le dialogue est qualifié souris + clavier ;
7. tests domaine, IPC, preload et renderer sont verts ;
8. E2E du vrai EXE packagé est vert ;
9. preuve responsive et visuelle est conservée comme artefact ;
10. les gates R1/R2/R3 Signalements restent verts.

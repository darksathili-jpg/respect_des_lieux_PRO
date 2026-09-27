# R4 — Audit fonctionnel Réparations

## Statut initial

R4 démarre volontairement en **RED**. Aucun travail CSS spécifique à Réparations n’est autorisé tant que le contrat fonctionnel n’est pas entièrement vert.

Base héritée : merge R3 `a3a9210b54967ed67bd79319d088d6a7bbc37f1d`.

## Dettes observées avant modification du produit

1. `createReparation()` tronque silencieusement plusieurs champs via `text(..., max)` au lieu de refuser une valeur hors contrat.
2. La mesure/action n’est pas obligatoire à la création.
3. Les dates `debut` et `cloture` ne sont pas validées comme dates calendaires ISO.
4. Le statut accepte toute chaîne ; aucune whitelist domaine n’est définie.
5. La création reste possible sous un signalement clos au niveau domaine.
6. L’édition n’est pas une opération domaine dédiée : `updateReparation()` du preload réutilise le canal de création et injecte `_repair_id`.
7. Le comportement d’édition dépend de `src/reparation-edit-extension.cjs`, chargé au bootstrap.
8. Il n’existe ni `getReparation()` ciblé, ni `queryReparations()` paginé côté SQLite.
9. La liste actuelle est plafonnée à 1000 entrées.
10. Ouvrir l’éditeur d’une réparation recharge la liste complète pour retrouver un élément.
11. Les contrôles d’édition de la vue Réparations sont décorés après rendu via `MutationObserver`.
12. La création/modification/statut d’une réparation n’alimente pas l’historique minimal du dossier.
13. Les états terminaux ne garantissent pas une date de clôture cohérente.
14. Les boutons `×` et `Annuler` du dialogue Réparations ne sont pas explicitement `type="button"`, alors qu’un handler de soumission métier existe sur le formulaire.
15. La soumission Réparations ne possède pas de garde `busy` équivalent à Signalements.

## Contrat de sortie P0

R4-P0 ne pourra être déclaré vert qu’après :

- validation stricte des champs et des statuts ;
- opérations domaine dédiées create/get/query/update/set-status ;
- IPC et preload dédiés, sans multiplexage `_repair_id` ;
- refus de mutation enfant sous un dossier clos ;
- recherche/pagination SQLite au-delà de 1000 réparations ;
- protection explicite de la recherche sur le référent ;
- historique minimal des mutations ;
- suppression de l’extension d’édition et de la décoration fonctionnelle par `MutationObserver` ;
- annulation clavier/souris sans écriture accidentelle et sans double soumission ;
- régression R3 inchangée.

Le vrai parcours Windows empaqueté sera ajouté et exigé avant l’autorisation de R4-P1 visuel.

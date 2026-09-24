# V5.2.1 — Parity & UX Gate

## Statut

Version de qualification uniquement. Données fictives tant que le Production Gate établissement / DPD n'est pas validé.

La V5.2.0-alpha.7 constitue la baseline technique locale validée sur poste Windows : installation, SQLite, photos, sauvegarde chiffrée et restauration. V5.2.1 ne doit pas fragiliser ce socle.

## Direction graphique validée

La refonte reprend l'identité du Lycée Watteau :

- Rouge Watteau : `#8B1E24`
- Terracotta : `#C76549`
- Crème : `#F4E6D9`
- Bleu ardoise : `#203F5A`
- Gris perle : `#D7D7DB`
- Blanc doux : `#FFFDF9`

Principes : lisibilité, confiance, proximité, protection des données, efficacité. L'interface conserve des contrastes élevés, des surfaces calmes et des actions critiques explicitement distinguées.

## Architecture de la refonte

La charte V5.2.1 est chargée comme une couche renderer au-dessus du socle validé : `renderer/theme-v521.js`.

Cette séparation est volontaire : la refonte graphique ne modifie ni le schéma SQLite, ni les chemins de stockage, ni la logique de sauvegarde/restauration, ni les politiques locales de confidentialité.

Le smoke test Windows empaqueté doit désormais prouver la présence de la couche Watteau avant d'autoriser une publication.

## Parity Gate

| Domaine | V5 locale | Cible V5.2.1 | Priorité |
|---|---|---|---|
| Création d'un signalement | OK | conserver | bloquant |
| Consultation fiche complète | OK | charte Watteau + accès direct | bloquant |
| Photos locales | OK | consultation claire + galerie | bloquant |
| Réparations / interventions | OK | parcours plus lisible | bloquant |
| Clôture / réouverture | OK | conserver | bloquant |
| Sauvegarde / restauration | OK et éprouvé sur poste | ne pas toucher sans test de non-régression | bloquant |
| Identités masquées | OK | conserver | bloquant |
| Recherche simple | OK | enrichir sans surcharge | haute |
| Filtres métier | partiel | statut, gravité, lieu, période | haute |
| Tri de colonnes | à compléter | tri explicite et accessible | haute |
| Pagination / grands volumes | fenêtre bornée | navigation claire et compteur | haute |
| Tableau de bord | fonctionnel | hiérarchie premium + informations utiles | haute |
| Statistiques | limitées | indicateurs simples, explicables et utiles | moyenne |
| Export CSV métier | à compléter | export contrôlé des listes | moyenne |
| Fiche imprimable | à compléter | impression sobre / économe en encre | moyenne |
| Cycle de vie / RGPD | OK techniquement | validation établissement / DPD requise | bloquant production |

## UX Gate — scénarios obligatoires

Chaque build candidate doit permettre sans ambiguïté :

1. créer un signalement ;
2. retrouver et ouvrir sa fiche ;
3. consulter les informations et identités selon l'état de masquage ;
4. ajouter puis ouvrir une photo ;
5. ajouter une intervention / réparation ;
6. clore puis rouvrir le dossier ;
7. retrouver le dossier par recherche ;
8. créer une sauvegarde chiffrée ;
9. restaurer cette sauvegarde ;
10. redémarrer et retrouver exactement les données attendues.

## Garde-fous graphiques

- aucun CDN, aucune police distante, aucune ressource HTTP(S) ;
- aucun style ne doit modifier la couche de données ;
- pas de texte sensible dans des éléments décoratifs ou journaux ;
- identités toujours masquées par défaut ;
- boutons destructifs visuellement différenciés mais non sensationnalistes ;
- navigation clavier et focus visibles conservés ;
- aucune publication Windows si le rendu empaqueté ne charge pas la charte V5.2.1.

## Critère de sortie de V5.2.1

V5.2.1 pourra être considérée comme candidate lorsque :

- la charte Watteau est cohérente sur toutes les vues ;
- les scénarios UX obligatoires passent sur le PC réel ;
- le Reliability Gate et le Packaged Runtime Smoke sont verts ;
- la sauvegarde/restauration reste inchangée et fonctionnelle ;
- les écarts de parité prioritaires sont fermés ou explicitement reportés ;
- aucune donnée réelle d'élève n'a été utilisée pendant la qualification.

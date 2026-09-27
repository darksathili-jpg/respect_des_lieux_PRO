# WATTEAU HERO — Qualification isolée

Branche : `watteau-visual-recovery-hero`

Objectif : qualifier uniquement le hero Watteau avant toute modification de la sidebar, du logo principal ou de l’icône.

## Contrat

- un seul asset binaire nouveau : `renderer/assets/watteau-home-hero.webp`
- une seule intégration UI : `renderer/home.css`
- aucune modification de sidebar, logo, icône ou vues métier
- aucune fusion vers `main` avant preuve runtime packagée

## Preuve d’intégrité binaire

Git blob SHA attendu et obtenu : `f218434628d3fbed827f756bf01d2cef312a4134`

## Gate attendu

Le workflow `V5.2 Packaged Windows Runtime Smoke` doit :

1. exécuter `npm run verify` ;
2. construire l’application Windows unpacked ;
3. vérifier le shell packagé ;
4. capturer l’Accueil réel en 1440×900, focus clavier et 1024×720 ;
5. publier l’artifact `packaged-runtime-evidence`.

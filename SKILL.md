---
name:   gap02
description: Expert Angular 19 pour ce projet, avec workflow structuré, conventions de code, accessibilité, sécurité Supabase et qualité de livraison.
applyTo: "**/*"
---

# Skill : Agent de développement Angular 19

## Quand l’utiliser
- Pour créer ou modifier des composants, services, guards, routes, modèles ou specs Angular 19.
- Pour corriger un bug métier ou technique dans ce projet.
- Pour implémenter une nouvelle fonctionnalité dans les domaines administration, POS, caisse, stock, produits, personnel ou rapports.

## Objectif
Faire évoluer l’application de manière professionnelle, cohérente et sécurisée, sans casser l’existant, en respectant un protocole de validation avant toute implémentation.

## Protocole obligatoire de travail

### Phase 0 — Reformulation et validation
Avant toute action de code :
1. Reformuler avec ses propres mots le besoin exprimé.
2. Proposer la solution envisagée, les fichiers concernés et l’approche technique.
3. Signaler les hypothèses ou ambiguïtés.
4. Poser une question claire de validation avant de continuer.

Ne jamais passer à l’implémentation tant que la compréhension n’est pas validée.

### Phase 1 — Analyse du besoin
- Comprendre précisément la demande.
- Vérifier s’un composant ou service réutilisable existe déjà dans src/app/shared ou src/app/core.
- Identifier tous les fichiers à créer ou modifier.
- Repérer les dépendances entre fichiers.

### Phase 2 — Plan de fichiers
Présenter un plan ordonné avec les fichiers à créer/modifier et leur rôle.

### Phase 3 — Implémentation fichier par fichier
- Démontrer un fichier à la fois.
- Inclure le contenu complet du fichier concerné quand c’est nécessaire.
- Indiquer son rôle, ses dépendances et le prochain fichier.
- Attendre confirmation avant de continuer.

### Phase 4 — Vérification finale
Valider systématiquement :
- Build sans erreur.
- Lint propre.
- Absence de logs de debug ou code temporaire.
- Tests unitaires couvrant au minimum un cas nominal, un cas d’erreur et un cas limite.
- Accessibilité vérifiée (focus, contraste, navigation clavier, libellés explicites).
- Vérification des policies RLS si une table Supabase est touchée.

## Conventions techniques Angular 19
- Utiliser des composants standalone uniquement.
- Privilégier les signals pour l’état local des composants.
- Utiliser OnPush par défaut sur tous les nouveaux composants.
- Utiliser la syntaxe de contrôle de flux moderne : @if, @for, @switch.
- Ajouter trackBy sur toute boucle dynamique sur liste.
- Réutiliser un composant/service/pipe déjà présent avant d’en créer un nouveau.
- Respecter les conventions déjà en place dans src/app.

## Règles UX/UI et accessibilité
- Produire un rendu moderne, cohérent, responsive et accessible.
- Ajouter des états hover, focus visibles et transitions fluides adaptées.
- Respecter le niveau WCAG 2.1 AA minimum.
- Éviter les interfaces génériques ou trop peu réfléchies.

## Règles sécurité Supabase
- Ne jamais utiliser de clé service_role côté client.
- Utiliser anon avec RLS active.
- Appliquer le principe du moindre privilège.
- Vérifier ou signaler explicitement l’absence de policy RLS adaptée sur les tables concernées.

## Règles qualité
- Identifier la cause racine avant toute correction.
- Appliquer une correction minimale et robuste.
- Ne pas réinventer un pattern déjà utilisé dans le projet.
- Si un besoin est ambigu, poser une seule question courte avant de continuer.

## Format de réponse attendu
Toujours répondre selon cette structure :
1. Reformulation du besoin
2. Analyse du besoin
3. Plan rapide
4. Fichier N/X — chemin complet
5. Confirmation pour continuer

## Exemples de prompts utiles
- “Ajoute un nouveau composant Angular 19 avec formulaire, état signal et tests.”
- “Corrige ce bug Angular en identifiant la cause racine avant de modifier le code.”
- “Implémente cette fonctionnalité en respectant le protocole Phase 0 à 4.”

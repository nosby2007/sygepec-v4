# SYGEPEC — Design System

> Version 1.0 | Mis à jour : 2024

## Introduction

SYGEPEC utilise un design system cohérent et premium basé sur une identité visuelle « Trust & Motion » — 
inspirée des plateformes financières et gouvernementales les plus fiables. 
L'objectif est de transmettre confiance, clarté et professionnalisme à chaque interaction.

---

## Palette de Couleurs

### Couleurs Primaires

| Token CSS               | SCSS Variable              | Valeur HEX | Usage |
|-------------------------|----------------------------|------------|-------|
| `--sy-primary-navy`     | `$sy-primary-navy`         | `#0B1F3A`  | Fond sidebar, titres forts |
| `--sy-primary-deep-blue`| `$sy-primary-deep-blue`    | `#123C69`  | Hover sidebar, variante sombre |
| `--sy-primary-trust-blue`| `$sy-primary-trust-blue`  | `#1E63D6`  | Boutons CTA, liens actifs |
| `--sy-accent-teal`      | `$sy-accent-teal`          | `#14B8A6`  | Accent succès, nav actif |
| `--sy-accent-gold`      | `$sy-accent-gold`          | `#F5B841`  | Badges premium, highlights |

### Couleurs de Fond

| Token CSS           | Valeur HEX | Usage |
|---------------------|------------|-------|
| `--sy-bg-soft`      | `#F6F9FC`  | Fond général des pages |
| `--sy-bg-card`      | `#FFFFFF`  | Fond des cartes et panels |

### Couleurs Sémantiques

| Token                | Valeur     | Usage |
|----------------------|------------|-------|
| `--sy-success`       | `#16A34A`  | Statut validé, document accepté |
| `--sy-warning`       | `#F59E0B`  | Avertissement, en révision |
| `--sy-danger`        | `#DC2626`  | Erreur, document rejeté |
| `--sy-info`          | `#2563EB`  | Information, liens neutres |

### Couleurs de Texte

| Token                   | Valeur    | Usage |
|-------------------------|-----------|-------|
| `--sy-text-primary`     | `#102033` | Texte principal |
| `--sy-text-secondary`   | `#5E6B7A` | Texte secondaire, labels |

---

## Typographie

**Famille de polices :** `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

Inter est chargée depuis Google Fonts avec les poids : 300, 400, 500, 600, 700, 800.

### Échelle Typographique

| Usage              | Taille | Poids | Variable |
|--------------------|--------|-------|----------|
| Hero Title         | 52px+  | 800   | —        |
| Page Title (h1)    | 28px   | 700   | —        |
| Section Title (h2) | 22px   | 700   | —        |
| Card Title         | 15px   | 600   | —        |
| Body               | 14px   | 400   | `$sy-font-size-base` |
| Small / Labels     | 12px   | 400–600 | `$sy-font-size-sm` |
| Micro              | 11px   | 600   | `$sy-font-size-xs` |

---

## Espacement

Basé sur une grille de 4px (rem scale 0.25 par unité) :

| Variable SCSS        | Valeur  | Utilisation |
|----------------------|---------|-------------|
| `$sy-spacing-xs`     | 4px     | Micro gaps |
| `$sy-spacing-sm`     | 8px     | Padding interne compact |
| `$sy-spacing-md`     | 12px    | Spacing standard |
| `$sy-spacing-lg`     | 16px    | Espacement card items |
| `$sy-spacing-xl`     | 24px    | Padding card |
| `$sy-spacing-2xl`    | 32px    | Section spacing |
| `$sy-spacing-3xl`    | 48px    | Large section breaks |

---

## Bordures & Rayons

| Variable SCSS        | Valeur  | Usage |
|----------------------|---------|-------|
| `$sy-radius-sm`      | 6px     | Boutons petits, badges |
| `$sy-radius-md`      | 8px     | Input fields |
| `$sy-radius-lg`      | 12px    | Boutons standards |
| `$sy-radius-xl`      | 16px    | Cards |
| `$sy-radius-2xl`     | 24px    | Panels, modals |
| `$sy-radius-full`    | 9999px  | Pills, chips |

---

## Ombres

| Variable SCSS      | Usage |
|--------------------|-------|
| `$sy-shadow-sm`    | Ombre légère cartes au repos |
| `$sy-shadow-card`  | Ombre cartes au hover |
| `$sy-shadow-modal` | Ombre panels, modals |

---

## Gradients

| Variable SCSS            | Valeur |
|--------------------------|--------|
| `$sy-gradient-primary`   | `linear-gradient(135deg, #0B1F3A 0%, #1E63D6 100%)` |
| `$sy-gradient-teal`      | `linear-gradient(135deg, #14B8A6 0%, #1E63D6 100%)` |
| `$sy-gradient-gold`      | `linear-gradient(135deg, #F5B841 0%, #f97316 100%)` |

---

## Composants UI (Bibliothèque `shared/ui/components`)

| Composant                | Sélecteur          | Description |
|--------------------------|--------------------|-------------|
| `SyButtonComponent`      | `app-sy-button`    | Variantes : `primary`, `secondary`, `outline`, `ghost`, `danger` |
| `SyCardComponent`        | `app-sy-card`      | Variantes : `default`, `elevated`, `bordered`, `gradient` |
| `SyStatusPillComponent`  | `app-sy-status-pill` | Types : `success`, `warning`, `danger`, `info`, `pending`, `approved`, `rejected` |
| `SyBadgeComponent`       | `app-sy-badge`     | Couleur de fond et texte personnalisables |
| `SyStatCardComponent`    | `app-sy-stat-card` | label, value, change avec coloration positive/négative |
| `SyProgressBarComponent` | `app-sy-progress-bar` | Pourcentage + label optionnel, gradient teal→blue |
| `SyPageHeaderComponent`  | `app-sy-page-header` | title, description, slot `[sy-action]` projeté |

---

## Z-Index

| Variable SCSS     | Valeur | Usage |
|-------------------|--------|-------|
| `$sy-z-base`      | 0      | Défaut |
| `$sy-z-dropdown`  | 100    | Dropdowns |
| `$sy-z-sticky`    | 200    | Headers sticky |
| `$sy-z-overlay`   | 300    | Overlays |
| `$sy-z-modal`     | 400    | Modals, widgets flottants |
| `$sy-z-toast`     | 500    | Notifications toast |

---

## Animations & Transitions

| Variable SCSS          | Valeur | Usage |
|------------------------|--------|-------|
| `$sy-transition-fast`  | `0.15s ease` | Hover states |
| `$sy-transition-normal`| `0.25s ease` | Panels, cartes |
| `$sy-transition-slow`  | `0.4s ease`  | Slide-ins, modals |

---

## Conventions de Nommage

- Tous les composants partagés sont préfixés `sy-` (ex. `sy-button`, `sy-card`)
- Tous les tokens CSS sont préfixés `--sy-` 
- Tous les tokens SCSS sont préfixés `$sy-`
- Les classes CSS suivent le pattern BEM ou descriptif direct (ex. `.card-header`, `.hero-section`)
- Les fichiers SCSS des composants importent `theme.scss` via chemin relatif

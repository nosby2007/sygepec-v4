# SYGEPEC - Lot 2 Public Foundation

Date: 2026-05-23

## Objectif

Poser la fondation visuelle, structurelle et marketing de l'experience publique premium avant la refonte profonde de la homepage au Lot 3.

## Ce qui a ete cree

### Layout public

- `src/app/features/public/layout/public-layout.component.ts`
- `src/app/features/public/layout/public-layout.component.html`
- `src/app/features/public/layout/public-layout.component.scss`

Le layout inclut:

- header sticky premium;
- navigation desktop avec mega menus legers;
- menu mobile;
- zone `<router-outlet>`;
- footer complet avec mission, liens, CTA et disclaimer.

### Design system public

Ajout dans `src/styles.scss`:

- tokens publics;
- hero premium;
- boutons publics;
- cards;
- sections;
- trust bar;
- stats;
- pricing;
- FAQ;
- timeline;
- responsive mobile.

### Modeles et donnees marketing

- `src/app/features/public/models/public-content.model.ts`
- `src/app/features/public/data/navigation.data.ts`
- `src/app/features/public/data/destinations.data.ts`
- `src/app/features/public/data/profiles.data.ts`
- `src/app/features/public/data/services.data.ts`
- `src/app/features/public/data/pricing.data.ts`
- `src/app/features/public/data/faq.data.ts`
- `src/app/features/public/data/public-home.data.ts`

Contenu prepare:

- Destinations: Canada, USA, UK, UAE, Europe, Australia.
- Profiles: Nurses, IT Professionals, Students, Skilled Workers, Families, Agencies.
- Services: Immigration File Setup, Document Checklist, Case Review, CV International, Job Application Support, IELTS/TEF Orientation, Interview Coaching, Family Relocation Planning, Premium Case Follow-up, Agency Dashboard Option.
- Pricing: Starter, Premium Candidate, Professional Support, Agency / Partner.
- FAQ avec disclaimers clairs.

### Composants publics reutilisables

- `PublicHeroComponent`
- `PublicSectionHeaderComponent`
- `TrustBarComponent`
- `DestinationCardComponent`
- `ProfileCardComponent`
- `ServiceCardComponent`
- `FeatureGridComponent`
- `ProcessTimelineComponent`
- `CTASectionComponent`
- `FAQAccordionComponent`
- `PricingPreviewComponent`
- `GlobalStatsComponent`

### Pages publiques preparees

- `DestinationsPageComponent`
- `DestinationDetailPageComponent`
- `ProfilesPageComponent`
- `ProfileDetailPageComponent`
- `ServicesPageComponent`
- `ServiceDetailPageComponent`
- `JobsPublicPageComponent`
- `PricingPageComponent`
- `AboutPageComponent`
- `ContactPageComponent`
- `FaqPageComponent`

## Routes publiques

Routes preparees sous `/public`:

- `/public`
- `/public/destinations`
- `/public/destinations/:slug`
- `/public/profiles`
- `/public/profiles/:slug`
- `/public/services`
- `/public/services/:slug`
- `/public/jobs`
- `/public/pricing`
- `/public/about`
- `/public/contact`
- `/public/faq`

Redirections top-level ajoutees:

- `/profiles`
- `/profiles/:slug`
- `/services`
- `/pricing`
- `/about`

## Homepage

La homepage existante n'a pas ete reconstruite en profondeur. Pour eviter une double navigation:

- suppression de l'ancien header interne;
- suppression de l'ancien bloc disclaimer interne, remplace par le footer global;
- correction de liens vers les nouveaux slugs publics;
- conservation du contenu actuel pour la refonte Lot 3.

## Validation

- Build Angular: OK avec `npm run build`.
- Le serveur local `ng serve` a compile, puis s'est arrete sur une erreur Windows/OneDrive de cache Angular:
  - `EPERM: operation not permitted, rmdir ... .angular/cache/.../vite/deps_ssr`
- Le plugin navigateur in-app n'expose pas l'outil d'execution requis dans cette session; la validation visuelle automatisee est donc reportee.

## Limites restantes

- La homepage doit etre reconstruite au Lot 3 avec le nouveau design system public.
- Les pages publiques sont des shells premium fonctionnels, pas encore les pages finales exhaustives des Lots 4 a 6.
- Le composant legacy `public-info-page.component.ts` reste dans le repo pour eviter une suppression risquee; il n'est plus route par `PUBLIC_ROUTES`.
- La page contact prepare une experience de consultation mais n'ecrit pas encore dans Firestore.
- La page jobs publique est un preview marketing; les candidatures reelles restent dans l'espace authentifie.

## Prochaine etape

Lot 3 - Homepage Futuriste Premium:

- reconstruire la home avec `PublicHeroComponent`, trust bar, stats, feature grid, timeline, pathway cards, destination/profile/service teasers, pricing preview, FAQ et CTA final;
- verifier le rendu responsive avec navigateur lorsque l'environnement local permet `ng serve` sans erreur cache.

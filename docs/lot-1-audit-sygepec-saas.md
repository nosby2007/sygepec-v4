# SYGEPEC - Audit Lot 1 et trajectoire SaaS premium

Date: 2026-05-23  
Scope: audit du projet existant, stabilisation minimale, architecture cible publique et SaaS.

## 1. Resume executif

SYGEPEC est deja une application Angular 20 + Firebase avec une base produit plus avancee qu'une simple landing page:

- routes publiques et authentifiees separees;
- Firebase Auth, Firestore, Storage et Cloud Functions;
- modeles canoniques pour dossiers, documents, taches, services, paiements, notifications et support;
- RBAC client/admin/super-admin et notions tenant/org;
- modules metier: immigration, audit, documents client, jobs, training, travel, support, admin, super-admin;
- design system global et plusieurs composants UI reutilisables.

Le point faible principal n'est pas la stack: c'est la coherence produit. La partie publique est encore trop concentree sur une home + page generique, alors que l'objectif commercial exige une experience marketing riche: destinations, profils, services, pricing, jobs publics, about et contact. Le back-office est deja structure, mais plusieurs flux restent partiellement relies a des collections legacy `sygepec*` et a des ecrans "coming next".

## 2. Stack identifiee

- Frontend: Angular 20, standalone components, Angular Router lazy-loaded.
- UI: SCSS global, Angular Material/CDK, composants partages `shared/ui`.
- State: Angular signals, RxJS interop.
- Backend: Firebase Auth, Firestore, Firebase Storage, Cloud Functions.
- Donnees: repositories Firestore par domaine, avec debut d'abstraction `DATA_PROVIDER`.
- Multi-tenant: `tenantId`, `orgId`, `organizationId`, roles et memberships.
- Build: Angular application builder `@angular/build:application`.
- Tests: Karma/Jasmine disponibles, couverture limitee visible.

## 3. Structure actuelle observee

### Public / marketing

Fichiers clefs:

- `src/app/features/public/public.routes.ts`
- `src/app/features/public/public-home.component.*`
- `src/app/features/public/pages/public-info-page.component.ts`
- `src/app/features/public/components/ai-intake-widget/*`

Etat:

- Home publique existante avec hero, audit, trust, destinations, training, relocation, CTA et widget IA.
- Routes publiques existantes pour `/public`, `/public/destinations`, `/public/destinations/:slug`, `/public/services/:slug`, `/public/contact`.
- Les pages destinations/services/contact sont encore gerees par un composant generique avec contenu minimal.
- Pas encore de routes publiques dediees pour profiles, services hub, jobs publics, pricing, about, FAQ.

### Authentification

Fichiers clefs:

- `src/app/features/auth/auth.routes.ts`
- `src/app/features/auth/login.component.ts`
- `src/app/features/auth/register.component.ts`
- `src/app/features/auth/admin-login.component.ts`
- `src/app/core/auth/auth-context.service.ts`
- `src/app/core/guards/auth.guard.ts`

Etat:

- Login, register, admin login presents.
- Guard auth attend la resolution du contexte avant decision.
- Redirection login avec `returnUrl`.
- Verification email / forgot password a confirmer ou completer.

### Dashboard client

Fichiers clefs:

- `src/app/features/dashboard/dashboard-home.component.*`
- `src/app/features/client/pages/client-*`

Etat:

- Dashboard client connecte aux dossiers canoniques.
- Affiche statut, progression, next action, draft audit, quick links.
- Documents/checklist partiellement annonce comme "Coming next" sur le dashboard.

### Immigration / dossier / documents

Fichiers clefs:

- `src/app/features/immigration/*`
- `src/app/core/models/canonical/dossier.model.ts`
- `src/app/core/models/canonical/dossier-document.model.ts`
- `src/app/core/models/canonical/dossier-task.model.ts`
- `src/app/core/repositories/dossier*.ts`
- `src/app/core/services/dossier-document-upload.service.ts`

Etat:

- Modele dossier solide: status, kind, destination, goal, readiness score, risk flags, compteurs documentaires, audit source.
- Modele document detaille: categories, status, review notes, expiration, metadata, linkage checklist/task.
- Module immigration avec dossiers list/detail et upload.
- Besoin de finir l'experience dossier client en sections metier completes.

### Jobs / opportunites

Fichiers clefs:

- `src/app/features/jobs/*`
- `src/app/features/jobs/data/jobs.repository.ts`
- `src/app/features/jobs/data/applications.repository.ts`

Etat:

- Jobs, job detail, job creation et applications existent.
- Public marketing jobs non expose hors auth.
- Les jobs sont actuellement dans le shell protege par auth, alors que le besoin inclut une page publique attractive.

### Services / pricing / paiements

Fichiers clefs:

- `src/app/core/models/canonical/service.model.ts`
- `src/app/core/models/canonical/payment.model.ts`
- `src/app/features/client/pages/client-service-requests.component.ts`

Etat:

- Modeles `ServiceCatalogItem`, `ServiceRequest`, `Payment` presents.
- Regles paiement protegees: client ne peut creer que `pending`.
- Pas encore de page pricing publique SaaS.
- Pas encore de checkout provider finalise visible.

### Admin / super-admin

Fichiers clefs:

- `src/app/features/admin/*`
- `src/app/features/super-admin/*`
- `src/app/features/admin/admin.guards.ts`

Etat:

- Admin dashboard, cases, case detail, documents, tasks, users, organizations, audit logs.
- Super-admin tenants, users, system audit, health, feature flags.
- Plusieurs vues utilisent encore mapping legacy/canonique.

## 4. Securite observee

Points forts:

- Firestore rules avec deny final.
- RBAC: `super_admin`, `org_admin`, `agent`, `client`, compat legacy.
- Helpers ownership/tenant: `ownerUid`, `userId`, `createdByUid`, `tenantId`.
- `payments` verrouille les transitions sensibles.
- `auditLogs` immutables.
- Storage path durci: `tenants/{tenantId}/users/{uid}/dossiers/{dossierId}/documents/{docId}/{fileName}`.
- Ancien chemin Storage en lecture seule.

Risques:

- Plusieurs services/repos appellent directement `getFirestore()`, `getAuth()` ou `getStorage()` au lieu des providers injectes, ce qui rend tests/mocks/environnements moins propres.
- Roles critiques lisibles depuis `users/{uid}`; les custom claims sont mentionnes comme prochaine etape, mais pas encore source d'autorite exclusive.
- Certaines collections legacy `sygepec*` restent actives avec compatibilite large.
- Manque de tests automatises de regles Firestore/Storage via Emulator Suite.
- Les uploads jobs applications n'imposent pas encore explicitement le type MIME dans Storage rules, seulement la taille.

## 5. Stabilisation Lot 1 appliquee

Correction faite:

- Ajout de `src/environments/environment.ts` comme environnement par defaut developpement.
- `app.config.ts` et `firebase.providers.ts` importent maintenant `../environments/environment` au lieu de `environment.development`.
- `angular.json` remplace `environment.ts` par `environment.prod.ts` en production.
- `environment.prod.ts` est normalise et `production` vaut `true`.

Pourquoi c'est important:

- Avant correction, un build production pouvait embarquer explicitement la config development.
- Le flag `production: false` dans `environment.prod.ts` etait incoherent pour une plateforme prete a vendre.

Validation:

- `npm run build` passe.
- Le premier build en sandbox a echoue par permission Windows/OneDrive (`EPERM lstat C:\Users\Perry Home WoundCare`), puis le build hors sandbox a reussi.

## 6. Dette technique prioritaire

Priorite P0:

- Finaliser les imports d'environnement et garder un build production propre.
- Ne pas exposer de secret serveur dans le frontend. La cle Firebase web est normale cote client, mais le fichier `sygepec-v4-firebase-adminsdk-*.json` ne doit pas etre versionne ni deploye cote public.
- Clarifier les changements non commites existants sur jobs/support/rules avant gros refactoring.

Priorite P1:

- Remplacer `public-info-page.component.ts` par une vraie architecture de pages publiques data-driven.
- Creer des fichiers de contenu structures: destinations, profiles, services, pricing, FAQ.
- Ajouter routes publiques: `/public/profiles/:slug`, `/public/services`, `/public/jobs`, `/public/pricing`, `/public/about`.
- Creer layout public reutilisable avec header/footer premium.
- Rendre les CTA coherents: assessment, pathways, consultation, create dossier.

Priorite P2:

- Harmoniser repositories et providers Firebase injectes.
- Ajouter tests de regles Firebase.
- Reduire dependance aux collections legacy via migration progressive.
- Enrichir dashboard client avec documents, tasks, timeline et recommendations reels.

## 7. Architecture cible recommandee

### Public premium

Proposition de structure:

```text
src/app/features/public/
  public.routes.ts
  layout/
    public-layout.component.ts
    public-layout.component.html
    public-layout.component.scss
  data/
    public-content.ts
    destinations.data.ts
    profiles.data.ts
    services.data.ts
    pricing.data.ts
    faq.data.ts
  components/
    public-hero/
    trust-bar/
    pathway-card/
    destination-card/
    profile-segment/
    process-timeline/
    feature-grid/
    testimonial-section/
    pricing-cards/
    faq-accordion/
    cta-section/
    global-footer/
  pages/
    homepage/
    destinations-hub/
    destination-detail/
    profiles-hub/
    profile-detail/
    services-page/
    jobs-public-page/
    pricing-page/
    about-page/
    contact-page/
```

Principes:

- Chaque page a une intention commerciale differente.
- Le contenu est structure, type et reutilisable.
- Les visuels CSS servent de fallback robuste: globe, document stack, timeline, dossier mockup, job card.
- Les pages publiques ne dependent pas d'auth.

### SaaS applicatif

Conserver l'architecture actuelle:

- `core`: auth, tenant, models, repositories, guards, firebase providers.
- `shared`: UI primitives, shell layout.
- `features`: domaines lazy-loaded.

Faire evoluer par extension:

- `features/client`: dashboard, profile, documents, services, support.
- `features/immigration`: dossier detaille et timeline.
- `features/jobs`: espace authentifie + admin posting.
- `features/public`: experience marketing complete.
- `features/admin`: operations tenant.
- `features/super-admin`: plateforme globale.

## 8. Lots recommandes

Lot 2 - Public Design System Premium:

- Public layout, header, mega menu, footer.
- Tokens publics complementaires.
- Composants CTA, cards, FAQ, pricing, timeline.

Lot 3 - Homepage premium:

- Remplacer la home actuelle par une page plus internationale, concrete et orientee conversion.
- Garder les assets CSS/fallback pour eviter images cassees.
- Ajouter CTA `Start your assessment` et `Explore pathways`.

Lot 4 - Destinations:

- Canada, USA, UK, UAE, Europe, Australia.
- Contenu unique: documents, etapes, profils, readiness, disclaimer.

Lot 5 - Profils:

- Nurses, IT Professionals, Students, Skilled Workers, Families, Agencies.
- Copy specifique et CTA par profil.

Lot 6 - Services / Pricing / Contact:

- Pages vendables et structure future paiement.
- Formulaire contact premium.

Lots 7 a 11:

- Dashboard client, dossier complet, documents/review admin, jobs/sessions, securite finale et production readiness.

## 9. Definition of done pour les prochaines pages publiques

Une page publique n'est terminee que si:

- son contenu est concret et specifique;
- aucun placeholder ou lorem ipsum n'est visible;
- elle a des CTA utiles;
- elle est responsive mobile;
- elle n'a pas d'image cassee;
- elle contient un disclaimer propre quand necessaire;
- elle peut etre montree a un client/partenaire sans donner l'impression d'un prototype.

## 10. Prochaines actions immediates

1. Creer le public layout premium et le header/footer global.
2. Introduire les fichiers data publics types.
3. Migrer la home vers des composants reutilisables.
4. Ajouter les routes manquantes publiques.
5. Verifier chaque page avec build puis navigation locale.

# SYGEPEC - User Journey E2E Audit

Date: 2026-05-23

## Scope

This audit focuses on the candidate journey from the public website to the authenticated workspace:

1. Public discovery (`/public`)
2. Assessment start (`/start-audit`)
3. Account creation or login
4. Case creation
5. Dashboard
6. Case overview
7. Document vault
8. Service/support requests
9. Jobs/training/travel readiness entry points

## Route Smoke Test

The local Angular server returned HTTP 200 for the key SPA routes:

- `/public`
- `/start-audit`
- `/auth/login`
- `/auth/register`
- `/public/destinations`
- `/public/profiles/nurses`
- `/public/services`
- `/public/jobs`
- `/public/pricing`
- `/dashboard`
- `/client/documents`

Authenticated pages return the SPA shell at HTTP level; real access control is handled by Angular guards and Firebase context.

## What Works

- Public CTAs consistently route to `/start-audit`.
- The assessment flow can collect destination, goal, identity, education, experience, language, budget, documents and timeline.
- Anonymous assessment drafts are persisted locally and can resume after login.
- Account gate exists inside the assessment, allowing account creation and case creation in the same journey.
- Login/register preserve `returnUrl` and support draft resume for `/start-audit`.
- Authenticated shell protects dashboard, client, immigration, support, jobs, travel, training and admin workspaces.
- Client document vault is functional and supports checklist, status groups, upload states and advisor review status.
- Service requests and support tickets are real Firestore-backed workflows.
- Build passes after this audit.

## Fixes Applied

### Tenant normalization

New client accounts now default to `sygepec-main` when no organization ID is entered. This prevents canonical dossier creation from failing because Firestore rules require the user's tenant to match the dossier tenant.

Changed file:

- `src/app/core/auth/auth-state.service.ts`

### Canonical dossier completeness

Audit-created canonical dossiers now receive:

- `destinationCountry`
- `immigrationGoal`
- `source: audit_wizard`
- null-safe assignment fields
- notes initialized to null

Without this, the dashboard could show a dossier with "Not yet defined" after a completed audit.

Changed file:

- `src/app/core/services/sygepec-data.service.ts`

### Canonical checklist and requested documents

After audit completion, SYGEPEC now attempts to create:

- a canonical checklist with `status: in_progress`
- requested document records under `dossiers/{dossierId}/documents`
- mapped document categories such as passport, diploma, transcripts, proof of funds, language test and CV

This closes a major E2E gap: the dashboard and document vault need real canonical document records before users can upload missing files.

Changed file:

- `src/app/core/services/sygepec-data.service.ts`

### Dashboard document card

The dashboard no longer says "Coming next" for documents. It now loads the active dossier's checklist and document summary:

- requested documents
- documents in review
- approved documents
- checklist readiness percentage
- direct link to the secure document vault

Changed files:

- `src/app/features/dashboard/dashboard-home.component.ts`
- `src/app/features/dashboard/dashboard-home.component.html`
- `src/app/features/dashboard/dashboard-home.component.scss`

## Remaining Gaps

### 1. Live Firebase account E2E not executed

No disposable Firebase test credentials were provided, so the audit did not create a real user or upload a real document in production Firebase.

Recommended next test:

- create a dedicated test user
- complete `/start-audit`
- verify Firestore writes:
  - `users/{uid}`
  - `sygepecCases`
  - `dossiers/{dossierId}`
  - `checklists/{checklistId}`
  - `dossiers/{dossierId}/documents/{docId}`
- upload one document from `/client/documents`

### 2. Browser automation unavailable in this session

The Browser plugin is installed, but the required Node REPL execution tool was not exposed by tool discovery. Verification was done through code inspection, route smoke checks and Angular build.

### 3. Auth UX remains below the public premium standard

Login/register are functional but visually behind the new public foundation. They need:

- forgot password page or inline reset flow
- stronger onboarding copy
- clearer tenant/agency explanation
- password requirements
- email verification readiness

### 4. Jobs public-to-authenticated bridge is incomplete

Public jobs are attractive, but a signed-in candidate journey should be tightened:

- public job detail route
- "Apply with SYGEPEC profile" leading to authenticated job application
- application status visible from dashboard

### 5. Timeline and tasks are not yet surfaced as a complete client workflow

The case timeline exists partially, but the client dashboard should show a proper next-step sequence:

- audit completed
- dossier created
- documents requested
- documents uploaded
- advisor review
- case review
- submission preparation
- follow-up

## Build Status

`npm run build` passes.

## Recommended Next Lot

Lot User Journey 1:

1. Premium redesign of auth/login/register/forgot-password.
2. Complete real E2E test with a disposable Firebase test user.
3. Add dashboard timeline/tasks section.
4. Add "continue journey" logic from dashboard based on dossier and document status.
5. Tighten public jobs to authenticated application handoff.

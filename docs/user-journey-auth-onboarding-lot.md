# SYGEPEC - User Journey Lot: Auth & Onboarding

Date: 2026-05-23

## Objective

Strengthen the first authenticated step of the candidate journey after the public site and assessment:

- premium login experience
- premium registration experience
- forgot password flow
- better draft resume continuity
- safer default tenant assignment for new client accounts

## Delivered

### Premium auth foundation

Created a shared auth UI style foundation used by login, register and forgot-password.

Files:

- `src/app/features/auth/auth-ui.styles.ts`
- `src/app/features/auth/login.component.ts`
- `src/app/features/auth/register.component.ts`
- `src/app/features/auth/forgot-password.component.ts`

### Forgot password route

Added a dedicated password reset page backed by Firebase Auth `sendPasswordResetEmail`.

Route:

- `/auth/forgot-password`

Files:

- `src/app/features/auth/auth.routes.ts`
- `src/app/features/auth/forgot-password.component.ts`

### Audit resume continuity

Login and register now preserve key onboarding query params:

- `returnUrl`
- `draft`

This protects the flow:

`/start-audit` -> account gate -> login/register -> resume audit -> create dossier.

### Safer tenant default

New client accounts now default to `sygepec-main` if the organization code is empty.

This is important because Firestore rules require tenant alignment for canonical dossier/checklist/document writes.

File:

- `src/app/core/auth/auth-state.service.ts`

## Validation

Route smoke test returned HTTP 200:

- `/auth/login`
- `/auth/register`
- `/auth/forgot-password`
- `/auth/login?returnUrl=%2Fstart-audit&draft=1`

Build:

- `npm run build` passes.

## Remaining Product Gaps

- Add email verification flow when Firebase template/settings are ready.
- Replace raw Firebase auth errors with user-friendly localized messages.
- Add a true password visibility toggle.
- Add a real disposable Firebase E2E test user to validate registration, audit submission and document upload against live rules.
- Bring admin login into the same premium visual system.

## Recommended Next Lot

User Journey Dashboard Continuity:

1. Add a premium case timeline widget to the dashboard.
2. Surface urgent tasks and missing documents as primary next actions.
3. Add a "continue journey" decision engine based on dossier/checklist/document status.
4. Tighten links between dashboard, documents, support, services and jobs.

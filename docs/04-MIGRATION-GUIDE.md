# Migration Guide (professional, low-risk)

## Phase 0 — Branch & safety
- Create branch: refactor/sygepec-v3
- Keep main branch deployable at all times.

## Phase 1 — Merge scaffold (no feature moved yet)
- Merge `src/app/core`, `src/app/shared`, `src/app/features`
- Merge `app.routes.ts`
- Verify: /dashboard renders after login

## Phase 2 — Enable multi-tenant
- Implement org membership writes:
  - orgs/{orgId}/members/{uid}
  - orgMembers/{orgId}_{uid}
- Tenant Switcher should list orgs from orgMembers where uid == current user

## Phase 3 — Migrate Support
- Move ticket/chat screens into features/support
- Replace component Firestore calls with TicketsRepository (tenant-filtered)

## Phase 4 — Migrate Training
- Move training screens into features/training
- Payments:
  - Client code -> core/payments
  - Webhook -> Cloud Functions (recommended)
- Add course-reader + live sessions

## Phase 5 — Migrate Immigration
- Move dossier screens into features/immigration
- Ensure every dossier includes tenantId and optional orgId

## Phase 6 — Jobs + Travel
- Jobs should be org-only (tenantId=org_<orgId>)
- Travel can be personal or org per policy

## Phase 7 — Cleanup
- Remove old routes, standardize naming (training not trainning), delete unused services.

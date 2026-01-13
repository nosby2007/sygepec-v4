# Architecture

## Folder layout
src/app/
- core/             Cross-cutting concerns (auth, tenant, guards, payments)
- shared/           Layout + UI primitives used everywhere
- features/         Domain modules (lazy-loaded)
- models/           Domain models (optional; keep near feature if preferred)

## Key design rules
1) No Firestore code in components. Use repositories/services under each feature.
2) Every business document has `tenantId` (and optional `orgId`).
3) Tenant context is selected in UI and stored in localStorage.
4) Org membership is validated in rules using:
   - orgs/{orgId}/members/{uid}
   - orgMembers (global index for quick listing)
5) Admin access is separated:
   - global admin: users/{uid}.globalRole == 'admin'
   - org admin: orgs/{orgId}/members/{uid}.role in ['owner','admin']

## Tenancy
- Personal workspace: tenantId='sygepec', orgId=null
- Organization workspace: tenantId='org_<orgId>', orgId='<orgId>'

## Collection strategy
Global collections:
- dossiers, tickets, jobs, liveSessions, travelBookings
Each doc includes `tenantId` field.

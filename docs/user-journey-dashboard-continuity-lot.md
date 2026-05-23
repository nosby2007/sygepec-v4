# SYGEPEC - User Journey Lot: Dashboard Continuity

Date: 2026-05-23

## Objective

Turn the client dashboard into a real operational cockpit:

- one clear next action
- urgent tasks
- missing/corrective documents as first-class actions
- premium timeline
- workflow stages
- no dead "coming next" states

## Delivered

### Continue Journey Engine

Added a computed decision layer in the dashboard that chooses the primary action based on:

- pending local audit draft
- active dossier status
- rejected or expired documents
- requested documents
- urgent/open dossier tasks
- review/travel/completed states

Primary actions now route to the correct workspace:

- `/start-audit`
- `/client/documents`
- `/client/my-case`
- `/travel`

File:

- `src/app/features/dashboard/dashboard-home.component.ts`

### Priority Actions

Added a dashboard section that surfaces:

- documents requiring action (`requested`, `rejected`, `expired`)
- top missing document labels
- urgent/high/open dossier tasks
- task status, priority and kind

Files:

- `src/app/features/dashboard/dashboard-home.component.html`
- `src/app/features/dashboard/dashboard-home.component.scss`

### Premium Timeline

The dashboard now reads timeline events from:

- `dossiers/{dossierId}/timeline`

If no timeline events exist yet, it shows a synthetic, honest timeline based on the active dossier and document state. This avoids an empty cockpit while still relying on real data when available.

Files:

- `src/app/features/dashboard/dashboard-home.component.ts`
- `src/app/features/dashboard/dashboard-home.component.html`

### Workflow Stages

Added a stage tracker:

- Assessment
- Dossier setup
- Documents
- Human review
- Travel readiness

The stage states are calculated from dossier, checklist and document status:

- `done`
- `active`
- `pending`
- `blocked`

### Responsive Dashboard UX

Added mobile-safe styling for:

- the main journey CTA card
- action rows
- stage list
- timeline mini feed

## Validation

Route smoke test returned HTTP 200:

- `/dashboard`
- `/client/my-case`
- `/client/documents`

Build:

- `npm run build` passes.

## Remaining Gaps

- Need a real Firebase test account to validate live task reads, timeline reads and document upload end-to-end.
- Timeline creation should eventually be canonicalized for all client-impacting events, including document upload, review decisions, service requests and job applications.
- Dashboard still needs notification/message counts once the notification module is connected to client-facing UI.
- Travel readiness is still mostly a navigation entry, not a computed readiness panel.

## Recommended Next Lot

Client Case Detail Premium:

1. Redesign `/client/my-case` into a premium dossier command center.
2. Surface full timeline, documents, tasks and advisor notes in one place.
3. Add dossier sections: identity, destination, goal, family, education, experience, language, budget, travel.
4. Add clear empty/loading/error states for every block.
5. Keep admin-only fields hidden from clients.

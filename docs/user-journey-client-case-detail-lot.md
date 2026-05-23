# SYGEPEC - User Journey Lot: Client Case Detail Premium

Date: 2026-05-23

## Objective

Transform `/client/my-case` from a simple snapshot into a premium client-facing dossier command center.

## Delivered

### Client Command Center

The page now shows a structured, premium case view with:

- active dossier reference
- destination and immigration goal
- readiness score
- case status
- preferred timeline when available
- last update
- primary command action

File:

- `src/app/features/client/pages/client-my-case.component.ts`

### Primary Case Action

Added a command action engine that chooses the most important action:

- start audit when no dossier exists
- fix rejected or expired documents
- upload requested documents
- review open client-visible tasks
- contact advisor when the case is on track

### Documents and Checklist

The case page now surfaces:

- requested documents
- documents in review
- approved documents
- rejected or expired documents
- checklist readiness
- direct link to the document vault

Actionable document rows use document status labels and descriptions from the canonical document status service.

### Tasks and Advisor Guidance

The page now reads tasks from:

- `dossiers/{dossierId}/tasks`

Visible task data includes:

- title
- description
- kind
- priority
- due date
- status

Admin-only/internal fields remain hidden from the client.

### Timeline

The page now reads timeline events from:

- `dossiers/{dossierId}/timeline`

If no timeline exists, it shows a transparent synthetic timeline from dossier/document state so the command center does not feel empty.

### Workflow Stages

Added a case stage tracker:

- Assessment
- Dossier setup
- Documents
- Human review
- Travel readiness

Stages use `done`, `active`, `pending` and `blocked` states based on dossier, checklist and document status.

## Validation

Route smoke test returned HTTP 200:

- `/client/my-case`
- `/dashboard`
- `/client/documents`

Build:

- `npm run build` passes.

## Remaining Gaps

- A live Firebase test user is still needed to validate real timeline/task/document reads and uploads end-to-end.
- Client-visible advisor comments should eventually be modeled separately from internal admin notes.
- Timeline should be automatically written for all important events: document upload, rejection, approval, service request, job application and status changes.
- The full dossier sections are not editable yet from client side.

## Recommended Next Lot

Client Profile & Dossier Sections:

1. Build a premium `/client/profile` and dossier data surface.
2. Show identity, passport, family, education, work experience, languages, budget and travel history.
3. Allow safe client-side edits where rules permit.
4. Add completion status per section.
5. Keep sensitive/admin-only fields hidden.

# Phase 1 audit: Perry Tax Pro / InnovaCare Business

Audited on 2026-10-24 against `codex/perry-tax-pro` at `1b5aa9a` (after the
enterprise UI merge). Production was checked read-only: Cloud Run revision
`perry-tax-pro-00010-5kn` and the rules released on project `sygepec-v4`.

## How security works in this app

The Next.js server never uses an admin credential. Every Firestore and Storage
call goes through the REST API with the signed-in user's own Firebase ID token
(`lib/firebase.js`). Firebase Security Rules are therefore the real
authorization boundary, not the API routes. A client can also call Firestore
directly with their own token (the web API key is public), so each rule has to
hold on its own, without relying on the server's validation.

## Rules: what is actually deployed

The Perry Tax Pro part of the live Firestore and Storage rules is identical to
`firebase/firestore.rules.snippet` and `firebase/storage.rules.snippet` as of
`1b5aa9a`. The snippets are integrated and live.

The SYGEPEC part of the live rules (`globalRole`, org staff, custom domains,
storage tenant fallbacks) does not exist in any commit of the repository,
including `master`. Deploying rules from any branch today would silently roll
those back.

## Feature matrix

Status: **OK** operational, **Partial**, **Absent**. Priority: P0 blocks safe
production use, P1 next, P2 planned.

| Area | Status | Problem found | Correction | Priority |
|---|---|---|---|---|
| Live SYGEPEC rules | Risk | Live rules have no source in git | Commit the live rules as the source of truth before any rules deploy | P0 (owner) |
| Marketing claims | Risk | Home and footer show 12,000+ returns, $38M+, 98% retention, 15+ years, 4.9/5 rating, "IRS e-file provider", 48-hr turnaround and named 5-star testimonials, none verified in the repo | Owner confirms each claim with evidence or it is removed | P0 (owner) |
| Return creation rules | Fixed (not deployed) | A client could create a return already marked `SIGNED`/`ACCEPTED`, with any `docCount`, extra fields or arbitrary IDs | Key whitelist, initial workflow values, ID must be `{uid}_{taxYear}` | P0 |
| Intake after signature | Fixed | Clients could change intake while Form 8879 was out for signature | API returns 409 at `READY_TO_SIGN`; rules freeze `intake`/`filingStatus` from `READY_TO_SIGN` | P0 |
| Document records | Fixed (not deployed) | A record could point at any Storage path | `storagePath` must sit in the return's own folder; key whitelist | P1 |
| Document delete | Fixed | Client delete returned 500 after the file was already removed (rules reject the `docCount` decrement) | Rules allow -1 (never below 0, never on filed returns); API treats the counter as best-effort | P1 |
| Storage delete | Fixed (not deployed) | Clients could delete files of a filed return directly in Storage | Same filed/accepted check as Firestore | P1 |
| Messages | Fixed (not deployed) | `authorName` was free text, so a client could post as "Your Preparer" | Must equal the author's profile name; key whitelist | P1 |
| Appointment requests | Fixed (not deployed) | Clients could add arbitrary fields (e.g. a meeting link) | Key whitelist, type enum | P1 |
| Path injection | Fixed | Request IDs were interpolated into Firestore REST paths (`../taxReturns/x` resolves elsewhere) | `safeId()` on every ID that reaches a path | P1 |
| Error handling | Fixed | Upload, notes, appointment and return updates crashed (non-JSON 500) on Firebase errors | JSON 503 with a user-safe message | P2 |
| Booking confirmation copy | Fixed | Page claimed "A confirmation will be sent to {email}"; nothing is sent | States the request is pending and visible in the portal | P1 |
| Booking name/email fields | Fixed | Editable, but the server ignores them and uses the account | Read-only, labelled "From your account" | P2 |
| Auth and sessions | OK | Logout deletes the cookie but does not revoke the Firebase refresh token; no app-level rate limiting on login/register | Revoke on logout via a trusted backend; add rate limiting | P2 |
| Concurrent updates | Partial | `mergeDocument` is read-modify-write without a precondition, so concurrent edits can be lost | Use `updateMask` and `currentDocument.updateTime` | P2 |
| Tax return workflow | OK | Status, signature and submission tracking are manual records, not IRS acknowledgements (already documented) | Keep the README gates | — |
| Upload validation | OK | Magic-byte checks and 10 MB limit; no malware scanning | Scan uploads before preparers open them | P1 |
| Tax appointments | Partial | Fixed client-side slots, browser timezone, no availability, no double-booking check, no reschedule, no assignment, no Zoom link, no history | Phase 2 | P1 |
| Business ledger, corrections, reconciliation, receipts | OK | Immutable records; preparer cannot see raw entries, only corrections, matches, receipts and year-end | Phase 6 | P2 |
| Business year-end | Partial | Can be submitted repeatedly; no review states; report totals are client-supplied | Draft → Submitted → Changes requested → Reviewed → Approved, computed server-side | P1 |
| Business customers, services, bookings, invoices | Partial | Owner is a single user (no organization, team or roles); no double-booking check; invoices stay `DRAFT` with no payment status | Phases 3 and 6 | P1 |
| Business reminders | Absent | Stub (`deliveryEnabled: false`) | Phase 5 | P2 |
| Public pages | Partial | Home, business, estimator, book, login, register exist; `/services`, `/team`, `/about`, `/blog`, `/updates`, `/contact`, business directory and profiles do not; footer links are anchors; no sitemap or robots | Phase 4 | P2 |
| CMS | Absent | — | Phase 4 | P2 |
| Notifications | Absent | No provider, queue or delivery log | Phase 5 | P2 |
| Central admin | Partial | Returns, appointments, signatures, submissions only; no user, business or audit views | Phase 7 | P2 |
| Tests | Fixed | No automated tests existed | `npm run test:rules`: 14 emulator tests covering clients, preparers, business isolation and Storage | — |

## Verification

- `npm run lint`: clean.
- `npm run build`: the changed code compiled and all 41 routes prerendered; the
  final standalone copy step then failed with ENOSPC because drive C: was full.
  A complete build of these changes has not run yet.
- `npm run test:rules`: 14/14 pass against the new snippets. Against the
  snippets as deployed today, 8 of the 14 fail, which matches the 8 gaps the
  new rules close.

## Not done in Phase 1

- The hardened rules are not deployed. Deploying them needs the live SYGEPEC
  rules committed first (see above) and the owner's approval.
- No end-to-end test against a separate DEV Firebase project.
- Marketing claims are unchanged pending the owner's decision.

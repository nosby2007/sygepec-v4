# InnovaTax security and production readiness (phase 8)

Reviewed November 2026 on branch `feature/innovatax-federal-georgia-mef`.

This document records what was checked, what was changed, and what is still open. It is
not a certification. Implementing these controls does not make InnovaTax compliant with the
FTC Safeguards Rule or IRS e-file requirements. The owner reviews and signs off on that,
and some items need outside parties (IRS, Georgia DOR, an outside scanner).

## What changed in this phase

| Area | Before | Now | Proof |
|---|---|---|---|
| Storage access to return files | Any preparer's token could read, add or delete files on any return | Only the client, the assigned preparer, the general admin, or a preparer within 30 minutes of giving a reason (read only). Fits Storage's two-document limit through fields mirrored on the account record | Rules tests "a preparer not assigned to the return cannot reach its files directly", "a fresh reason opens the files for reading only, until it expires" |
| Blocked accounts | A block ended the app session, but the account's own token still reached its Firestore records | The Firestore and Storage rules refuse every request from a blocked account. Unblocking restores access | Rules tests "Blocked accounts" (4 tests) |
| Client field injection | Client update rules used `changedKeys()`, which ignores *added* fields, so a client could add fields such as `reviewStatus` or `efileState` to their own return. The rules test for this was already failing on the old rules | Every `hasOnly` check in the tax rules uses `affectedKeys()`, which counts added and removed fields too (12 rules) | Rules test "answers approved by the preparer review are frozen for the client" now passes |
| Signed Form 8879 saving | Any preparer opening a return could complete a signature and save the signed PDF with their own token | Only the client, the assigned preparer or the general admin complete it. Anyone else leaves the request open, and the next authorized person to open the return completes it, so the signed form is never lost | Code review (`lib/esign.js`). Not covered by an automated test |
| E-file transmission permission | Checked inside the service | Pure function `transmitterAllowed`, tested: reviewing never includes transmitting | Unit test "unauthorized transmission attempts are refused" |

Each of the new Storage and blocked-account tests fails on the previous rules and passes on
the new ones (both runs were done).

**Before release:** the rules live in `firebase/*.rules.snippet`, and the live SYGEPEC rules
files are not in git. Fetch the live rules, merge only the tax block, review the result, and
deploy rules only. Nothing here was deployed.

**Storage lookups per request:** Firebase's Storage rules may read **at most two** Firestore
documents per request, and the emulator does not enforce that limit. So the Storage rules
read only the caller's own `taxUsers/{uid}` record and the return (or the support
attachment). What they need about the caller is mirrored on that record by the server:

- `blocked`, written with `taxAccountBlocks` when the general admin blocks or unblocks;
- `platformAdmin`, written when a support role is set (Support settings or
  `scripts/support-grant.mjs`);
- `fileGrants` (`{clientUid: expiry in ms}`), written when a preparer gives a reason.

The lookups for each rule were counted by hand (at most two on every path).

**Before release:**

- Re-run `scripts/support-grant.mjs` for each existing general admin, so the
  `platformAdmin` flag is set.
- Block and unblock each account blocked before this change, or set `blocked: true` on
  its record.

Until then, those admins reach unassigned files only with a reason, and those blocked
accounts are refused by Firestore but not yet by Storage. Check that a preparer can open a
file right after deploying the rules.

## Checklist (spec section 10)

Status words: **Tested** (automated test), **Implemented** (in code, reviewed, no test),
**Partial**, **Open** (not done), **Owner** (business or outside action).

| Item | Status | Notes |
|---|---|---|
| Firebase tenant isolation | Tested | Every tax rule checks `tenantId == 'perry-tax-pro'`. Tax collections are separate from SYGEPEC's. The catch-all denies everything else. Server-only collections (`taxSubmissions`, `taxEfileSandbox`, `taxEfileOnboarding`, `taxAccessGrants`, `taxAccountBlocks`, …) have no client rules |
| Firestore and Storage rules | Tested | 54 rules tests and 36 integration tests pass on the emulators |
| Preparer assignment restrictions | Tested | Changes need the assignment or the general admin role, in both Firestore and Storage. Every preparer can still *read* return records in Firestore (by design: the app shows the reason screen before documents, messages and bank details). Narrowing Firestore reads too would be a product decision |
| Least privilege | Partial | Transmitting is separate from reviewing. Production e-file needs explicit server settings. The server identity bypasses the rules and is used for server-only records. Firebase accounts cannot be disabled by the app (needs `roles/firebaseauth.admin`, deliberately not granted) |
| Encryption of sensitive tax information | Partial | Google encrypts all Firestore and Storage data at rest and in transit. Bank numbers are also encrypted by the app (`lib/bank-rules.js`, AES-GCM with a server secret). Full SSNs and ITINs are never stored: only the last four digits. Return answers and documents have no application-level encryption beyond Google's |
| Secure SSN and banking workflows | Implemented | Last four digits only. Bank numbers are entered by the client only, encrypted, and shown to staff only after a reason. E-file packages carry the last four digits. A real transmission must take full numbers from a secure store at send time, which is not built (no real transport exists) |
| Secrets management | Partial | Secrets come from environment variables (`SESSION_SECRET` must be ≥ 32 characters, Stripe, DocuSeal, MeF settings). None are in git. Moving them to Secret Manager with rotation is an owner step for production |
| Audit logs | Implemented | `taxAudit`, server-only, 7-year retention. E-file prepare, transmit, acknowledgement, refusal, reconcile and onboarding changes are all logged |
| Session invalidation | Tested | Idle timeout and a 7-day maximum session (`lib/session-token.js`, `session.test.mjs`). A block ends the session, and the rules now refuse the account's token. A password change does not revoke existing Firebase refresh tokens (needs Admin SDK rights) |
| Data retention | Partial | The daily job deletes audit entries after 7 years and flags returns over 7 years old for a person to review. Signed Form 8879 records cannot be deleted. E-file submission records have no retention rule yet. Pub. 1345 asks EROs to keep Form 8879 for 3 years; the 7-year figure is the business's choice |
| Disaster recovery | Open | No documented backup or restore. Recommended: enable Firestore point-in-time recovery and scheduled exports, Storage object versioning, and a written restore test |
| Secure transmission | Partial | HTTPS everywhere with HSTS, a strict content security policy and secure headers (`firebase.json`). No IRS or Georgia transmission exists yet. A real MeF transport needs the IRS A2A specifications and certificates |
| Incident response | Open (Owner) | No written incident response plan. IRS guidance asks e-file providers to report data theft to the IRS (Stakeholder Liaison) and to states. The plan must name who does this |

## IRS Publication 4557 and Publication 1345: review

These are summarized from memory, not quoted. Check every point against the current
editions before signing off.

**Pub. 4557, Safeguarding Taxpayer Data** (guide to the FTC Safeguards Rule for tax
professionals):

| Expectation | InnovaTax |
|---|---|
| Written information security plan (WISP) with a responsible person | Owner: not written |
| Risk assessment | This document is a start. Owner to complete |
| Multi-factor authentication for staff | Implemented: two-step sign-in with an authenticator app (`lib/mfa.js`) |
| Access limited to what each person needs | Improved in this phase (Storage, blocks). Every preparer can still read return records in Firestore |
| Encryption of customer data in transit and at rest | Google default plus app encryption for bank numbers |
| Activity monitoring and logs | Audit log, Admin › Security |
| Staff training | Owner |
| Vendor oversight (Google, Stripe, DocuSeal, Twilio, AI document reader) | Owner: list vendors and their agreements |
| Incident response and reporting | Open |

**Pub. 1345, Handbook for Authorized IRS e-file Providers**:

- Every person on the e-file application passes the IRS suitability check. An EFIN alone
  does not authorize transmission. Covered in onboarding and the e-file guide.
- Form 8879 is kept for 3 years. Signed 8879 records cannot be deleted here.
- The security, privacy and business standards for online providers apply when
  taxpayers file their own returns through the software. As remembered, they cover:
  - an extended validation SSL certificate;
  - weekly external vulnerability scans;
  - written privacy and safeguards policies;
  - protection against bulk filing of fraudulent returns;
  - public domain name registration;
  - reporting security incidents.

  InnovaTax's portal collects answers but only preparers file, so whether these apply
  must be confirmed with the current edition. Weekly external scanning is a good practice
  either way.

## Testing done in this phase

| Suite | Result |
|---|---|
| Unit tests (`npm test`) | 284 / 284 pass |
| Rules tests on the Firebase emulators (`npm run test:rules`) | 54 / 54 pass |
| Integration tests on the emulators (`npm run test:integration`) | 36 / 36 pass |
| Lint | Clean |
| Production build | Succeeds. Next.js 16.4.2 reports a known security advisory on some runs, and the suggested upgrade (`next upgrade --agent=security`) was not applied: it needs approval |
| End-to-end browser tests | Not run. The repository has none for these screens |
| Performance, load and recovery tests | Not run. No load-test harness or restore procedure exists |

**Running the emulator tests on Windows:** if Java fails with "Unable to establish loopback
connection", set `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Temp\jtmp` (any short
folder that exists). The emulators can also stay running after a run and hold their ports;
stop them before the next run.

## Status of InnovaTax, by the five statuses

| Status | Federal | Georgia | E-file |
|---|---|---|---|
| CODE COMPLETE | Supported forms, see the tax-year matrix | Form 500 and Schedule 3 | Sandbox chain complete for both. No official adapter or transport |
| TESTED | Yes (automated) | Yes (automated) | Yes, sandbox only |
| TAX VALIDATED | No: no module has reached VALIDATED. That needs a credentialed reviewer to check against official worksheets | No | Not applicable |
| ATS APPROVED | No | No (Georgia testing not started) | No |
| PRODUCTION AUTHORIZED | No | No | No: refused by code until every item is in place |

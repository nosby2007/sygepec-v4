# Perry Tax Pro

Perry Tax Pro is the standalone InnovaCare tax preparation portal deployed in
the Firebase project `sygepec-v4`. It provides client registration, guided tax
intake, secure document exchange, messaging, appointment requests, return
tracking, and a preparer operations dashboard.

InnovaCare Business is a separate client category with its own registration,
navigation, authorization boundary, and daily workspace for bookkeeping,
customers, services, appointments, invoices, reconciliation, and year-end tax
handoff. Standard tax clients do not receive access to Business features.

Returning clients can keep a year-by-year history and start the next tax year
from a filed or accepted return. The renewal copies identity, contact, filing,
spouse, and dependent details while resetting all annual income, deductions,
bank details, documents, preparer assignment, signature, and e-file state.

The preparer workspace includes appointment confirmation queues, Form 8879
signature-status tracking, and controlled e-file readiness/submission tracking.
It records verified workflow events and acknowledgements; it does not transmit
returns directly to the IRS.

Production: <https://perry-tax-pro-sygepec-v4.web.app>

## Architecture

- Next.js 16 application with server-rendered routes
- Firebase Authentication for email/password accounts
- Firestore collections isolated under the `perry-tax-pro` tenant
- Firebase Storage objects isolated under `tax/perry-tax-pro/`
- Cloud Run service `perry-tax-pro` in `us-central1`
- Dedicated Firebase Hosting site `perry-tax-pro-sygepec-v4`

The application lives separately from the Angular SYGEPEC application even
though both use the same Firebase project.

## Local development

Copy `.env.example` to `.env.local`, provide a random `SESSION_SECRET` of at
least 32 characters, and then run:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

## Validation

```bash
npm run lint
npm run build
npm audit --omit=dev
npm run test:rules
```

`test:rules` wraps the snippets under `firebase/` in their service blocks and
runs `firebase/test/rules.test.mjs` against the Firestore and Storage
emulators. It needs the Firebase CLI and Java 21+. On Windows, if the Firestore
emulator exits with "Unable to establish loopback connection", point Java at a
short temp folder first:

```bash
JAVA_TOOL_OPTIONS="-Djdk.net.unixdomain.tmpdir=C:/Temp/jtmp" npm run test:rules
```

The Phase 1 audit and feature matrix are in `docs/AUDIT-PHASE1.md`.

## Preparer accounts

Public registration always creates a `CLIENT`. A preparer must first exist in
Firebase Authentication and have a matching `taxUsers/{uid}` document with:

```json
{
  "uid": "firebase-auth-uid",
  "name": "Preparer name",
  "email": "preparer@example.com",
  "phone": null,
  "role": "PREPARER",
  "tenantId": "perry-tax-pro",
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp"
}
```

Preparers use the normal `/login` page and are redirected to `/admin`.

## Deployment

The Dockerfile builds the standalone Next.js server. Cloud Run receives the
Firebase public configuration as environment variables and `SESSION_SECRET`
from Secret Manager. After deploying a new Cloud Run revision, redeploy the
dedicated Hosting target so its pinned rewrite points to the new revision:

```bash
gcloud run deploy perry-tax-pro --source . --region us-central1 --project sygepec-v4
npx firebase deploy --only hosting:perry-tax-pro-sygepec-v4 --project sygepec-v4
```

Do not deploy the default `sygepec-v4` Hosting site from this directory.

## Dedicated branch policy and release gates

**Permanent application branch:** `codex/perry-tax-pro`. Do not merge this branch into `master` or `main`. All Perry Tax Pro development stays on this branch unless the repository owner explicitly changes this policy.

**Security gate:** The Firestore and Storage snippets under `firebase/` are NOT automatically active. Review and integrate them with the actual deployed rules before accepting taxpayer data. A client-side document-count increment is retained for upload compatibility; this is not an authoritative accounting or audit control. Replace it with a trusted backend transaction before production.

**Signature gate:** The Form 8879 signature state is manually tracked. Selecting `SIGNED` is not proof of identity, consent, or a verified electronic signature. Do not use it as sole evidence for e-file authorization.

**Submission gate:** `SUBMITTED` and `ACCEPTED` are manually recorded external statuses, not IRS acknowledgements. Verify original evidence before marking either status.

**Validation gate:** Run build, lint, Firebase Emulator authorization tests, and synthetic end-to-end testing against a separate DEV Firebase project. Review MFA, session revocation, malicious upload scanning, retention/deletion, and audit events before production.

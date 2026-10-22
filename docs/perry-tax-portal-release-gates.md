# Perry Tax Pro portal — development release gates

## Scope
A pilot client dashboard for tax-case intake and support tickets, built alongside SYGEPEC immigration. Tax return calculation, e-file, payments, document upload, signatures, and preparer administration are NOT implemented by this branch.

## Privacy and security
- Never collect real taxpayer PII until formal security validation.
- Dedicated taxCases and taxTickets collections; no shared immigration records.
- Firebase Security Rules enforce client ownership; no client changes to privileged case status.
- Preparer access, cross-tenant assignment and external filing status require a trusted server workflow and audit logging before activation.
- Add mandatory MFA, secure document access without persistent public download URLs, retention policy, WISP, incident response, encryption review, rate limits and abuse monitoring before production.

## Verification required
1. npm ci && npm run build
2. Firebase Emulator Suite rules tests for client A vs B, unauthenticated users, immutable tenant/client IDs, forbidden status escalation and ticket tampering.
3. End-to-end intake, support, login/logout, route guards and regression tests for immigration.
4. Security review of all pre-existing Firestore/Storage rules and legacy compatibility paths.
5. DEV deploy and manual acceptance with synthetic data only.

No production release or merge until these gates pass.

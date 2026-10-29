# Phase 8: Security

## Two-step sign-in (authenticator app)
- Required for preparers, optional for clients and businesses (Security page in the menu).
- After a correct password the session is marked `mfa: "verify"` (or `"setup"` for a
  preparer who has not turned it on). `proxy.js` and `getFirebaseSession()` treat such a
  session as signed out everywhere except `/login/verify` and `/api/auth/*`. Preparer
  sessions sealed before this phase carry no flag and must pass the step too.
- Codes are RFC 6238 (`lib/totp.js`), one step of clock drift allowed, each code usable
  once. 5 wrong codes lock the step for 15 minutes.
- 8 one-time recovery codes; only their SHA-256 hashes are stored.
- `taxMfa/{uid}` is server-only. The secret is AES-256-GCM encrypted with a key derived
  from `SESSION_SECRET`. **Rotating `SESSION_SECRET` invalidates every authenticator
  setup**; reset them from Admin › Security afterwards.
- Lost phone and no recovery code: another preparer presses **Reset** on Admin › Security.
- Sign-in fails closed (503) if the two-step record cannot be read.

## Audit log
- `taxAudit/{time_uuid}`, server-only, written with the server identity (`lib/audit.js`).
- Records sign-ins (also failed), two-step events, document upload / open / delete,
  blocked uploads, preparer return changes, fee changes, Stripe confirmations, plan
  changes, Form 8879 send / cancel / completion, retention runs. Includes IP and browser.
- Admin › Security shows the latest 500 with filters. Kept 7 years, then removed by the
  daily `retention` task.

## Upload checks (`lib/file-scan.js`)
- Real type from the first bytes; name and browser type are ignored.
- Refused: EICAR test signature, Windows programs, `<script>` / PHP / HTML inside images,
  PDFs with `/Launch` or `/RichMedia`, programs attached inside a PDF, damaged PDFs.
  Compressed PDF streams are unpacked and checked too.
- Allowed on purpose: JavaScript, XFA and attachments in PDFs, because every fillable
  IRS form (W-9, 1099-NEC, 8879) contains them.
- This is a content check, not an antivirus engine. A full scan (e.g. ClamAV on Cloud
  Run, or a Storage-triggered scanner) can be added later behind the same function.

## Signed Form 8879 kept
- Firestore rules: nobody can create `SIGNED_8879` / `SIGNATURE_AUDIT` records (only the
  server identity writes them) and nobody can delete them.
- Storage rules: files named `signed-*` under a return cannot be deleted.
- The documents API and screen refuse / hide the delete button for them.

## Stripe webhooks (`/api/stripe/webhook`)
- Off until `STRIPE_WEBHOOK_SECRET` is set (returns 503).
- Signature checked (HMAC-SHA256, 5-minute tolerance); every handler reads the object
  back from Stripe, and all are safe to run twice.
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `account.updated`.
- Two endpoints in Stripe point here (your account, and connected accounts). Put both
  signing secrets in the one secret, separated by a comma.

## Data retention (daily job, task `retention`)
- Deletes audit entries older than 7 years.
- Marks online invoice links still unpaid after 30 days as `EXPIRED`.
- Counts tax returns older than 7 years for a person to review. Nothing about a
  return is deleted automatically.

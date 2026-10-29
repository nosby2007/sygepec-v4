# Phase 7: Payment gate, business plans and daily automation

## Payment gate (personal and business returns)

- **Who sets the fee:** the preparer, on each return, under **Fee and payment**. The fee
  starts at $149 for personal returns and $250 for business returns, and can be changed.
- **When the client pays** (chosen per return):
  - **Before the client signs Form 8879** (default): signing and e-filing are both blocked
    until the fee is paid.
  - **After signing, before e-file:** only the e-file step is blocked.
  - **After filing:** nothing is blocked. The client is asked to pay once the return is
    filed.
- **How the client pays:**
  - **By card**, through Stripe Checkout, from their dashboard (personal) or from
    **Plan & payments** (business).
  - **From their refund** (personal returns): this clears the block. The preparer sets up
    the refund transfer in the e-file software (see `IRS-EFILE-GUIDE.md` §5).
- **Payments taken in the office:** the preparer can record a payment (cash, check, card
  in office), waive the fee, or mark it unpaid again.
- **Enforcement:** the server checks the fee before it records a signature
  (`/api/returns/[id]`, and the business return action "sign"). It checks again before
  "ready to e-file", "submitted" or "transmit". When blocked it answers HTTP 402.
- **Confirming a card payment:** a payment counts only when the server reads the Checkout
  Session back from Stripe and finds it paid, for the right amount, in USD. The client
  being sent back to the site proves nothing on its own.

## Business plans

Basic $15, Advanced $25 and Premium $39 per month, under **Plan & payments**
(`/portal/business/plan`). Clients can switch plans (prorated), cancel at the end of the
period, or keep their plan. The daily job keeps each plan's status in step with Stripe.
Plans do not lock any features yet; which features each plan includes is still to be
decided.

## Daily automation (`/api/cron/daily`)

| Task | Who gets it | How often |
| --- | --- | --- |
| Appointment reminder | Tax clients with a confirmed appointment in 12 to 36 hours | Once per appointment |
| Booking reminder | Business customers with a confirmed booking in 12 to 36 hours | Once per booking |
| Missing documents | Returns waiting on documents, untouched for 2 days | Every 4 days |
| Signature reminder | Form 8879 requested more than 2 days ago | Every 3 days |
| Payment reminder | Unpaid fees that are due | Every 4 days |
| Plan sync | Every business subscription | Daily |

Reminders go by email, and also by text once texting is set up. Messages point to the
portal and contain no tax figures. Each send is stamped on the record (`autoReminderAt`,
`reminderSentAt`, `lastDocReminderAt`, `lastSignReminderAt`, `lastReminderAt`), so
running the job twice sends nothing new.

**Status emails:** these go out immediately, not on the daily schedule. The client gets an
email when a personal return moves to In review, Ready to sign, Filed or Accepted. For a
business return, the stages are Awaiting signature, Transmitted, Accepted and Rejected.

## How it is set up

- **Server identity.** The Cloud Run service account
  (`perry-tax-pro-runtime@sygepec-v4.iam.gserviceaccount.com`) writes payment results and
  runs the automations. It needs:
  - `roles/datastore.user` on the project
  - `secretAccessor` on `STRIPE_SECRET_KEY`

  The collections `taxCharges` and `taxBilling` have no security rules, so only the server
  can read or write them.
- **Stripe.** The app uses SYGEPEC's live key (`STRIPE_SECRET_KEY`). Prices are given on
  each Checkout Session, so nothing is created in the Stripe account. No webhook is
  needed: payments are confirmed when the client returns from Checkout, and plans are
  synced daily.
- **Schedule.** The Cloud Scheduler job `perry-tax-daily` calls the Cloud Run URL every day
  at 9:00 America/New_York. It authenticates with a Google OIDC token for the runtime
  service account. The route checks the token's signature, audience (`CRON_AUDIENCE`)
  and email. Any other caller gets a 404.
- **Dry run.** `?dryRun=1` reports what would be sent, without sending or writing
  anything.

```bash
gcloud projects add-iam-policy-binding sygepec-v4 --member serviceAccount:perry-tax-pro-runtime@sygepec-v4.iam.gserviceaccount.com --role roles/datastore.user
gcloud secrets add-iam-policy-binding STRIPE_SECRET_KEY --project sygepec-v4 --member serviceAccount:perry-tax-pro-runtime@sygepec-v4.iam.gserviceaccount.com --role roles/secretmanager.secretAccessor
```

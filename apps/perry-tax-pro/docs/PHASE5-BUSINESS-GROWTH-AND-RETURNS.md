# Phase 5: business growth tools and business tax returns

## For business owners

**Growth hub** (`/portal/business/growth`):

- **Growth setup score:** a nine-step checklist (publish page, online booking, three
  public services, logo, team calendars, 10+ customers, 5+ consents, first feedback
  request, first campaign), each step linking to where it's done.
- **Trends and KPIs:** income from the books and bookings over six months, income this
  month vs last, bookings in the next 7 days, repeat-customer rate, average rating,
  90-day no-show rate.
- **Today:** requests to confirm (one click), tomorrow's reminders (copy, open a text
  message, email if configured, mark sent), today's bookings, past bookings to close
  (done / no-show), follow-ups due, and lapsed customers to win back.
- **Marketing:** email campaigns to an audience chosen by stage and tags, with a live
  count. Only customers who agreed to marketing and have not unsubscribed are included.
  Personalisation (`{{first_name}}`, `{{business}}`, `{{booking_link}}`), an unsubscribe
  link and one-click unsubscribe headers on every email, CSV export of the audience,
  "I sent it myself", and locked campaigns once sent (duplicate to reuse).
- **Feedback:** a private link per completed visit (one answer per link, expires after
  60 days), a star rating with comment, and the customer's choice to allow publishing.
  Owners feature consented feedback on their public page, which shows the average of
  featured reviews and says how they were selected. Nothing is invented or imported.

**Customers** (`/portal/business/customers`) is now a CRM: a pipeline board (Lead,
Customer, Regular, Lapsed) and a list view, with search. Customer cards show visits,
lifetime value, last and next visit, stage (with a suggested stage from visit
history), tags, follow-up date, recorded marketing consent (with date), the visit
history, and a notes and contact log. Bookings link to the customer card ("Customer
card"), creating the customer if needed; booking online is not treated as consent.

**Accounting** shows the status of each business tax return the preparer is working on.

## For preparers: business tax returns

On each business case (`/admin/business/{case}`), below the existing cockpit, a
**Return preparation** section:

- **Entity → form:** sole proprietor (Schedule C), partnership (1065), S corporation
  (1120-S), C corporation (1120), with the matching signature form (8879, 8879-PE,
  8879-S, 8879-CORP) and extension form (4868 / 7004).
- **Automatic line mapping** from the adjusted bookkeeping (client corrections
  applied). Categories without their own line on a form go to other deductions, with
  the attached statement. Meals are limited to 50%. Unknown categories are flagged.
- **Preparer adjustments** to any line (payroll, officer compensation, depreciation,
  interest, corrections), each requiring an explanation.
- **Results:**
  - C corporations: 21% federal tax on taxable income, before NOL, special deductions,
    credits and payments.
  - S corporations and partnerships: pro-rata Schedule K-1 box 1 allocation that
    always adds back to the total.
  - Schedule C: estimated self-employment tax with the Social Security wage base for
    2024–2026.
- **Due dates** (original and extended, rolled past weekends) and the extension flag.
- **Diagnostics before review:**
  - Blocking: legal name, EIN last 4, accounting method, ownership totalling 100%,
    at least two partners, books present, an explanation for every adjustment.
  - Warnings: unreconciled entries, expenses of $75 or more without a receipt, losses
    (basis and at-risk limits), and S corporations without officer compensation.
- **Workflow with evidence:**
  1. Preparing → In review → Approved. Approval requires a review confirmation and
     records the reviewer and a snapshot of the totals.
  2. Awaiting signature → Signed. Records the method, signer, title, date and where the
     signed 8879-x is kept.
  3. Transmitted. Requires the 20-character MeF submission ID and the software used.
  4. Accepted or Rejected, with the date and reject codes. A rejected return can be
     corrected and goes back to Preparing.

  The Firestore rules enforce the same order: no transmission without a signature
  record, and no approval without a reviewer.
- **Audit trail** of every save and status change, and an **e-file data export** (JSON
  and CSV: lines, statement, K-1 allocations, adjustments, review and signature) for
  import into the preparer's e-file software.

### What this does not do

It does not transmit returns to the IRS. Federal business e-file goes through IRS
Modernized e-File (MeF), which requires an EFIN and software that has passed IRS
assurance testing (ATS). Returns are transmitted from that software and the submission
and acknowledgement are recorded here. Full EINs and owner SSNs are never stored in this
workspace (only the EIN's last four digits). It also does not prepare balance sheets
(Schedule L), M-1/M-2 reconciliations, depreciation schedules (Form 4562), state
returns, or payroll forms. Line references follow the current federal forms and must be
checked against the form for the year filed.

## Email

Email sending (reminders, campaigns) uses Resend's API and is off until
`RESEND_API_KEY` and `MAIL_FROM` (a verified sender) are set on the Cloud Run service.
Until then, every message can be copied, texted from the phone, or exported, and the
owner records what they sent.

## Tests

- `npm test` runs 33 unit tests, including 12 for the return engine and 6 for the
  growth helpers.
- `npm run test:integration` runs 36 tests, including 9 new ones:
  - The full S-corp return workflow from the books to IRS acceptance, with blocked
    shortcuts.
  - The export without a full EIN.
  - Owner and outsider access, and forged status jumps refused by the rules.
  - CRM updates and notes isolation.
  - Booking → customer, and manual reminders.
  - Feedback link reuse, the single answer, publishing only with consent, and forged
    feedback refused.
  - Campaign audience consent and opt-outs, and sent campaigns locked.
- `npm run test:rules` passes (28).

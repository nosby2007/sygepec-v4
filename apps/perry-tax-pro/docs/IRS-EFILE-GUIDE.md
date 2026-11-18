# E-filing returns with the IRS: how to set it up

This guide is about getting InnovaCare Tax from **preparing** returns to **e-filing** them
with the IRS. It covers what the IRS requires, the three ways to transmit, the approach we
recommend, and how the app fits in. It is a technical and process overview, not legal
advice. Check the current IRS publications named below before acting, because the rules
change every year.

---

## 1. Who may e-file for clients

To e-file someone else's return you must be an **Authorized IRS e-file Provider**.

| Step | What | Where |
| --- | --- | --- |
| 1 | A **PTIN** for every person who prepares returns for pay | IRS Tax Pro Account / PTIN system |
| 2 | An **IRS e-Services account** for each principal and responsible official (identity checked through ID.me) | irs.gov → e-Services |
| 3 | The **IRS e-file Application**, choosing the role **ERO** (Electronic Return Originator) | e-Services → e-file Application |
| 4 | Fingerprints for each principal and responsible official, unless they are a CPA, EA or attorney (who prove their credential instead) | Instructions in the application |
| 5 | Suitability check (tax compliance, credit, criminal background) | Done by the IRS |
| 6 | **EFIN** (Electronic Filing Identification Number) issued | Usually within about 45 days |

Key references:
- **Pub 3112**: how to apply.
- **Pub 1345**: the rules every ERO must follow.

Once you have the EFIN, the website may honestly say "Authorized IRS e-file Provider".
Until then it must not, which is why that claim was removed from the site.

**State returns:** most states accept returns through the IRS Fed/State program, using the
same software and EFIN. A few states also need their own preparer registration.

---

## 2. How a return actually reaches the IRS

Every e-filed return goes through **MeF** (Modernized e-File). A return is converted to
XML, following the IRS schemas for each form and year. It is sent in a submission with a
**20-character Submission ID**. The IRS then sends back an **acknowledgement**, either
Accepted or Rejected with error codes, usually within 24 to 48 hours.

There are three ways to get a return into MeF:

### Option A: Professional tax software (recommended)
Perry Tax works as an **ERO**: it prepares the return in IRS-approved professional software,
and the software company acts as the transmitter. Examples include Drake Tax, TaxSlayer Pro,
CrossLink, ATX, ProSeries, UltraTax, Lacerte and TaxAct Professional.
- **Effort and cost:** a yearly license.
- **What the software handles:**
  - every form and the yearly schema changes
  - state returns
  - transmission and acknowledgements
  - electronic signatures (in most packages)
  - **bank products** (paying the fee from the refund; see section 5)
- **Timeline:** live as soon as the EFIN arrives.

### Option B: Become a transmitter yourselves (not recommended)
To send returns to MeF directly, the company must apply as a **Transmitter** and a
**Software Developer**. That requires:
- Building XML generation for every supported form, following **Pub 4164** (the MeF guide
  for software developers) and the yearly schema packages.
- Passing the IRS **Assurance Testing System (ATS)** with the IRS test scenarios every
  year, under **Pub 1436** for individual returns. Business forms have their own ATS
  publications.
- Connecting through the MeF **A2A** web services. These are SOAP services that need
  system-to-system credentials, strict security controls and careful handling of
  acknowledgements.
- Re-certifying every filing season.

**Realistic cost:** a dedicated engineering team, with **6 to 12 months** before the first
filing season, and the work recurs every year. It only pays off for software companies
that sell e-filing to other preparers.

### Option C: Partner e-file APIs
Some companies offer e-filing through an API:
- **Personal (1040):** these products are mostly designed for consumers to file their own
  return inside another app. They don't usually fit a paid-preparer business. Confirm
  with any vendor that its product supports returns prepared by a paid preparer under
  your EFIN.
- **Information returns (1099, W-2) and payroll forms (941, 940):** these are well served
  by APIs.
  - The IRS's own **IRIS** system (Information Returns Intake System) accepts 1099s
    through a free web portal and an A2A channel.
  - Commercial APIs such as TaxBandits also cover W-2, 1099 and 94x.
  - This fits the **Business workspace**, which already has the books needed to produce
    1099-NEC forms for contractors.

---

## 3. Recommended plan for InnovaCare Tax

1. **Get the EFIN** (section 1). Start now; it's the longest step.
2. **Choose professional software that has:**
   - personal and business returns (1040, 1065, 1120-S, 1120)
   - built-in **remote e-signature for Form 8879** with identity verification (see
     section 4)
   - **refund transfer** bank products
   - a way to **import** data, or at least export acknowledgements as CSV. Ask each
     vendor what import formats it accepts.
3. **Keep the app as the client-facing system:**
   - It handles the questionnaire, documents, appointments, video, payments and status
     updates.
   - The preparer enters the return in the tax software, using the app's intake and its
     business-return working papers. The business return already exports a line-by-line
     CSV package for this.
4. **Record the e-file result in the app:**
   - **Business returns:** the app already requires the **20-character MeF Submission
     ID**, the software name and the acknowledgement result. Reject codes are stored.
   - **Personal returns:** the Signature & e-file panel records submitted, accepted or
     rejected and the reference.
5. **Later, automate acknowledgements:** if the chosen software can export acknowledgement
   reports, or offers an API, add a daily import to the scheduled job. It would update
   Accepted or Rejected without retyping. This app's daily job is where that would go.
6. **Information returns:** if business clients need 1099-NEC forms, generate them from
   the Business workspace books and file them through IRIS or a 1099 API. That's a
   separate, smaller project.

---

## 4. Form 8879 e-signatures

Form 8879 (and 8879-PE, 8879-S, 8879-CORP and the others) is the client's authorization
for the ERO to e-file. The IRS allows electronic signatures on it under **Pub 1345**, but
only when:

- The e-signature software **verifies the signer's identity** for remote signing. In
  practice this means knowledge-based authentication by a third-party identity service,
  or checking a government ID.
- The software records:
  - the signer's name
  - the date and time
  - the IP address (for remote signing)
  - the identity check result
  - a **tamper-proof** copy of the signed form
- The ERO keeps the signed 8879 for **3 years** from the return's due date, or from the
  date the IRS received it if later.

The app's signature step is a **record**, not the signature itself. It refuses to e-file
until a signature is recorded. To make signing fully online, use the e-signature built
into your professional software (most have it), or connect an e-signature provider that
offers IRS-compliant identity checks. The app would then store the provider's completion
evidence with the return.

---

## 5. Taking the fee from the client's refund

**The IRS does not pay preparers.** The refund always goes to the taxpayer. The law and
the IRS rules forbid preparers from:
- endorsing or cashing a client's refund check (IRC §6695(f))
- having the refund sent to the preparer's own bank account, for example by splitting it
  on Form 8888

**The legal way is a refund transfer (RT)**, a bank product offered through professional
tax software:

1. The client agrees to the RT while the return is being prepared. They sign the bank's
   application, which discloses all bank fees.
2. The return is e-filed with the refund going to a **temporary account at the partner
   bank**.
3. When the IRS pays the refund, the bank takes out the preparation fee and its own fee.
   It pays the preparer and sends the rest to the client, by direct deposit, check or
   card.
4. If the IRS pays less than expected, the bank takes its fees first. The client should
   understand the fee is still owed.

Rules to follow:
- **Circular 230 §10.27:** the fee **cannot depend on the size of the refund**. It must be
  a fixed or itemized amount, the same whether the client pays by card or from the refund.
- **Disclosure:** clients must be told the RT is optional, that it costs extra, and how
  long it takes. Some states regulate RTs and refund anticipation products, so check
  your state's rules.
- **In the app:** **"Pay from my refund"** sets the fee to *From refund*. That clears the
  payment block so the return can be signed and filed. The preparer must then enroll the
  client in the RT in the tax software before transmitting. The preparer's fee panel
  shows a reminder about this.

---

## 6. What's in the app today

| Area | In the app now | Still needs outside setup |
| --- | --- | --- |
| Payment gate | Fee per return; pay before signing, before filing, or after; card through Stripe; the server blocks the signature or e-file step until paid | – |
| Pay from refund | Client can choose it; it clears the block | RT enrollment in the tax software, which needs an EFIN |
| Signature | Signature is recorded and required before filing | IRS-compliant remote e-signature with identity checks |
| E-file | Submission ID, software name and acknowledgement recorded; rejected returns go back to preparing | EFIN and professional software |
| Acknowledgement import | Manual | Software export or API, added to the daily job |
| 1099 / W-2 filing | – | IRIS or a 1099 API (future project) |

Publications: 3112 (application), 1345 (ERO rules), 4163 (MeF for providers), 4164 (MeF
for software developers), 1436 (ATS for individual returns), and Circular 230.

---

## 7. Direct transmission (MeF adapter), phase 5

InnovaTax now contains the engineering for Option B, ready for official testing but
**not able to reach the IRS**. Production stays disabled until every gap below is closed.

Chain: approved calculation snapshot -> return data -> schema adapter -> XML -> schema
validation -> InnovaTax consistency rules -> package (SHA-256 hash, idempotency key) ->
transport -> verified acknowledgement -> submission state.

| Piece | Where | Status |
| --- | --- | --- |
| Submission states (NOT_READY ... ACCEPTED / REJECTED, FAILED_RETRYABLE, INDETERMINATE) | `lib/efile/states.js` | Code complete, tested |
| Package, XML, schema check, consistency rules, acknowledgement parsing | `lib/efile/package.js` | Code complete, tested, **sandbox schema only** |
| Records, readiness (layer 4), Form 8879 bound to the approved fingerprint | `lib/efile/submission.js` | Code complete, tested |
| Sandbox transport and production gate | `lib/efile/transport.js` | Sandbox only |
| Firestore records `taxSubmissions/{key}`, audit, return status | `lib/efile/service.js` | Code complete; not run against Firestore yet |
| Preparer panel, transmission worklist, client status | `components/EfilePanel.js`, `/admin/submissions`, `/portal/returns` | Code complete; not checked in a browser yet |

Rules the code enforces:
- A receipt or an HTTP success is never an acceptance. Only a verified acknowledgement
  (matching submission reference and package hash) moves a submission to ACCEPTED or
  REJECTED, and only an **authoritative** transport changes the return's filing status.
  A sandbox acceptance never does.
- One record per return, year, jurisdiction and approved answers. Building the same
  package again returns the same record. A record with an unknown outcome cannot be sent
  again until it is reconciled with the receiver.
- Form 8879 counts only if it was signed for the approved fingerprint. New answers or
  a reopened review take the submission back to "not ready".
- Reviewing and transmitting are separate permissions: transmitting takes the general
  admin role or a uid in `EFILE_TRANSMITTER_UIDS`.
- In production, every rule module used must be FILING_READY.

Server settings:

| Variable | Meaning |
| --- | --- |
| `EFILE_MODE` | `off` (default), `sandbox` or `production` |
| `EFILE_TRANSMITTER_UIDS` | Comma-separated preparer uids allowed to transmit, besides the general admin |
| `EFILE_PRODUCTION_AUTHORIZED`, `MEF_EFIN`, `MEF_ETIN`, `MEF_A2A_CERT_SECRET` | Read by the production gate. Even with all of them set, production is refused while no official transport and schema adapter are installed. |

Still needed from the business owner and the IRS before real transmission:
1. IRS e-file application with the Software Developer and Transmitter roles (an EFIN
   alone does not allow transmission), then an ETIN.
2. The tax-year 1040 MeF schema and business rule packages from e-Services, built into
   an official adapter (`officialAdapter` in `lib/efile/package.js`).
3. The A2A specifications and system credentials, built into an official transport
   (`OFFICIAL_TRANSPORTS` in `lib/efile/transport.js`), with credentials kept in Secret
   Manager.
4. ATS testing with the Pub 1436 scenarios, then the IRS acceptance letter.
5. Georgia: its own approval and testing for state submissions; federal approval does
   not cover it.

Status words, never interchangeable: CODE COMPLETE (yes, sandbox), TESTED (unit tests),
TAX VALIDATED (no), ATS APPROVED (no), PRODUCTION AUTHORIZED (no).

---

## 8. ATS test package and onboarding, phase 6

**Assurance testing (ATS).** `npm run ats` runs every scenario through the questionnaire,
the federal and Georgia engines, the package builder, the schema check and the
consistency rules. It compares the figures with the expected ones and writes the package
(one XML file per scenario and jurisdiction, `report.md`, `report.json`) to
`ats-out/<date>/`. It exits with code 1 if any scenario fails.

- InnovaTax reference cases (`lib/efile/ats.js`) always run. Their expected figures are
  worked by hand in the engine tests. They prove the chain, not IRS approval.
- The official Pub. 1436 scenarios are released to e-file applicants. They go in
  `ats/scenarios/*.json` (format in `ats/scenarios/README.md`), entered from the
  official publication. A scenario marked `IRS_ATS` without its reference is refused.
- Real ATS means transmitting those returns to the IRS ATS environment with the official
  schema and transport, and receiving IRS acknowledgements. That is only possible once the
  onboarding steps below are done.

**Onboarding tracker.** The admin page **E-file readiness** (`/admin/efile`) lists every step,
who owns it (business owner, IRS, Georgia DOR, engineering) and what it is needed for
(ATS, production, Georgia):
- Steps for the owner, the IRS and Georgia are recorded by the general admin, with a note.
  The record is audited and kept in `taxEfileOnboarding/{tenant}`.
- Engineering steps (official schema adapter, official transport, Georgia adapter,
  reference cases) are read from the code and cannot be marked done by hand.
- A step recorded as done whose server setting is missing (EFIN, ETIN, A2A credentials,
  production authorization) is flagged.
- Recording steps never turns transmission on.

The same page shows the tax-year support matrix (every module and its status on the
PENDING to FILING_READY ladder) and the result of the reference cases.

Order of work for the owner: e-Services accounts -> e-file application (ERO, Software
Developer, Transmitter) -> suitability -> ETIN in test status -> download the schemas and
A2A specifications -> engineering builds the official adapter and transport -> enter the
Pub. 1436 scenarios -> ATS -> communication test -> production status -> security sign-off
(Pub. 4557, Pub. 1345) -> production switch. Georgia follows with its own approval.

## 9. Georgia e-file adapter, phase 7

**What Georgia publishes** (checked November 2026; confirm every year with Georgia DOR):

- Georgia takes individual income tax returns (Form 500) through the Fed/State
  Modernized e-File program. Its developer guide is the "Fed/State MeF Individual Income
  Tax Electronic Filing Guidelines & Information for Software Developers". The newest
  edition found online was for tax year 2017. Ask Georgia for the current one.
- Each tax year, a software developer sends Georgia a Letter of Intent and registers its
  product before testing. Georgia then runs its own testing and approves the product.
  Georgia sets its deadlines every year.
- Vendor contact: GA.Vendors@dor.ga.gov.
- **IRS approval does not include Georgia.** Georgia needs the whole federal path (e-file
  application, ATS, production status) plus its own approval on top.

**What is built:**

- `lib/efile/georgia.js` has:
  - the Georgia sandbox schema adapter (`INNOVATAX-GA-SANDBOX-<year>`, with its own
    namespace, separate from the federal one);
  - the InnovaTax Georgia checks (IX-GA-001 to 009). These are not Georgia's business
    rules.
- **Link to the federal return.** Every Georgia package is linked to the federal
  submission for the same approved figures (`<LinkedFederal>`). That reference is known
  before either package is built. A Georgia submission:
  - can be built at any time;
  - waits while the federal return has not been sent;
  - is blocked if the federal return was rejected, or was filed through other software.
    Georgia-only submissions are not supported.
- **Separate Georgia sandbox receiver** (`INNOVATAX-GA-SANDBOX`). It rejects a Georgia
  return whose federal submission never arrived (GA-SBX-LINK-1) or was rejected
  (GA-SBX-LINK-2). A Georgia rejection points to the screen that fixes it.
- **Separate production gate.**
  - `GA_EFILE_AUTHORIZED=true` records Georgia's approval. It is never implied by the
    federal settings.
  - Every federal gap is also a Georgia gap.
  - No Georgia transport or schema adapter is installed, so Georgia production is always
    refused.
- **On the return**, Georgia's state is stored apart from the federal one (`efileGa`). It
  never changes the return's federal filing status. Clients see it only for real (not
  sandbox) submissions.
- **Onboarding** now lists these Georgia steps: Letter of Intent, product registration,
  Georgia schema, Georgia schema adapter (read from the code), Georgia testing, Georgia
  approval (checked against `GA_EFILE_AUTHORIZED`), and the official transport.

**Not supported yet:**

- correcting a rejected Georgia return after the federal return was accepted (that needs
  a Georgia-only resubmission);
- Form 500X;
- Forms IND-CR and 500-NOL.

**To finish (owner):**

1. Letter of Intent and product registration with Georgia DOR.
2. Get Georgia's current guide, schema and test cases.
3. Engineering builds the official Georgia adapter and transport from them.
4. Georgia testing.
5. Georgia approval letter.
6. Set `GA_EFILE_AUTHORIZED=true`. This happens only after the federal production status.

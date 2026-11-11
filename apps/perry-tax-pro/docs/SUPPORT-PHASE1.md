# Customer Support, Phase 1

Support inside the existing app: Customer 360, tickets, SLA, audit and the Support Operations
screens. Nothing here is a separate service.

## How access works

Support staff have the account role `SUPPORT`, separate from `PREPARER`, because a preparer can read
every tax file. `getFirebaseSession()` treats `SUPPORT` as signed out, so every existing page and API
refuses it, and `proxy.js` confines it to `/admin/support` and `/api/support`.

Access needs all of: a `PREPARER` or `SUPPORT` account, finished two-step sign-in, and a
`taxSupportRoles/{uid}` document. Removing that document ends access on the next request.

Support records have no Firestore rules. The catch-all rule denies every browser token, and only the
server identity reaches them, after the permission checks in `lib/support-*.js`.

## Permissions

| Permission | Agent | Supervisor | Platform Admin |
|---|---|---|---|
| Search and view customers (masked contact details) | Yes | Yes | Yes |
| See full email and phone | | Yes | Yes |
| View and create tickets, queues, SLA monitor, metrics | Yes | Yes | Yes |
| Reply, note and change tickets assigned to them or to nobody | Yes | Yes | Yes |
| Work any ticket, assign to anyone, reopen a closed ticket | | Yes | Yes |
| Open and release quarantined attachments | | Yes | Yes |
| Read the support audit log | | Yes | Yes |
| Change SLA policy and support roles | | | Yes |

`BILLING_SPECIALIST`, `TECHNICAL_SUPPORT` and `COMPLIANCE_OFFICER` are named in `lib/support-rules.js`
with no permissions, and cannot be granted until a later phase defines them.

Support has no route that changes a tax return, moves money, gives a refund or impersonates a customer.

## Data

| Collection | Holds |
|---|---|
| `taxSupportTickets/{number}` | The ticket. The number is the document ID, so the database guarantees it is unique. |
| `taxSupportMessages/{id}` | `EXTERNAL` replies and `INTERNAL` notes. The customer query filters on `EXTERNAL`. |
| `taxSupportEvents/{id}` | Append-only history, committed with each change. Assignments live here. |
| `taxSupportAttachments/{id}` | File details and state. Files are in Storage under `taxsupport/`. |
| `taxSupportRoles/{uid}` | Who holds which role. |
| `taxSupportSettings/sla` | The SLA policy. |
| `taxSupportCustomerIndex/{uid}` | Search terms and a name. No tax data. |
| `taxSupportIdempotency/{hash}` | Retry protection, removed after 7 days. |
| `taxSupportRate/{hash}` | Rate-limit counts, removed when expired. |
| `taxAudit` (existing) | Support entries add `area: "SUPPORT"`, `outcome` and `correlationId`. |

Customer 360 reads accounts, returns, fees and business details from the records that own them on each
request, and copies none of them. Returns come back as a status line, without questionnaire answers.

Every ticket change commits on the ticket's `updateTime` and checks a `version` the screen sends, so
two people saving at once cannot overwrite each other: the second is told to reload (409).

## API

All routes need the session and permission above, and return `{ error, code, correlationId }` on
failure. Changes must come from the same origin. Lists are capped at 100 per page.

| Route | Does |
|---|---|
| `GET /api/support/customers?q=` | Search customers |
| `GET /api/support/customers/{uid}` | Customer 360 |
| `POST /api/support/customers/reindex` | Build search from existing accounts (Platform Admin) |
| `GET, POST /api/support/tickets` | List (filters, `cursor`, `limit`) and create |
| `GET, PATCH /api/support/tickets/{id}` | Read; `action`: `status`, `priority`, `assign`, `escalate`, with `version` |
| `POST /api/support/tickets/{id}/messages` | `kind`: `INTERNAL` or `EXTERNAL`, with `version` |
| `POST /api/support/tickets/{id}/attachments` | Upload |
| `GET, PATCH /api/support/attachments/{id}` | Download; release from quarantine |
| `GET /api/support/queues`, `/sla`, `/metrics`, `/audit` | Read only |
| `GET, PUT /api/support/settings/sla`, `/settings/roles` | Policy and roles |
| `GET, POST /api/support/my/tickets` | The customer's own requests |
| `GET /api/support/my/tickets/{id}` | One request, without notes or SLA details |
| `POST /api/support/my/tickets/{id}/messages`, `/attachments` | Reply and upload |
| `GET /api/support/my/attachments/{id}` | Download |

Creating a ticket or message accepts `idempotencyKey`: a retry with the same key returns the first result.

## Attachments

`lib/file-scan.js` is a content check, not a full antivirus. So the workflow fails closed: a file that
fails is never stored, and one that passes stays `QUARANTINED` until a supervisor releases it. Files
always download, never display on our site.

The Storage rules hold to the same record. A file can be created only for a record the server wrote
after its checks, with the same person, path, size and type, and reading follows the record's state. So
a browser token cannot skip the file check or open a quarantined file. Deploy the code before these
rules: the current code works under the old rules, but older code cannot upload under these.

## SLA

Deadlines count office hours in the policy's time zone, skip holidays and follow daylight saving. Time
waiting on the customer moves the resolution deadline. "At risk" is the share of office time used, and
a change of priority keeps customer waiting time and a reopened ticket's fresh window. The daily job escalates tickets at risk or
overdue; the SLA Monitor is computed when opened, so it is current even between runs.

## Deployment checklist

Nothing below has been done. In this order:

1. **Indexes.** Create those in `firebase/support.indexes.json`. Do not use `firebase deploy --only
   firestore:indexes` from this folder, because it could affect the SYGEPEC indexes. Create each with
   `gcloud firestore indexes composite create`, and wait until they are ready. The emulators do not
   enforce indexes, so these queries are only proven once run against the real database.
2. **Storage rules.** Merge the new `taxsupport` block from `firebase/storage.rules.snippet` into the
   live rules, keeping everything else. Attachments fail until this is done. No Firestore rule change
   is needed: the live catch-all already denies these collections.
3. **Deploy** Cloud Run, then Hosting.
4. **First admin.** `node scripts/support-grant.mjs sygepec-v4 <email> PLATFORM_ADMIN --dry-run`, then
   without `--dry-run`. That person sets up two-step sign-in at next sign-in.
5. **Build search.** `POST /api/support/customers/reindex` once. The daily job keeps it fresh.
6. **Privacy Policy.** Add support tickets, attachments and who can see them, before customers use it.

**Rollback:** redeploy the previous Cloud Run revision and Hosting. New collections and indexes can
stay; nothing existing changes shape. To end one person's access, delete their `taxSupportRoles` document.

## Tests

```bash
npm test
npm run test:rules
npm run test:integration
```

End to end, against the app running on the emulators (it refuses anything but localhost):

```bash
SUPPORT_E2E_URL=http://localhost:3011 npm run test:support-e2e
```

## Known limits

- Escalation runs with the daily job. For faster escalation, add a scheduler job every 15 minutes on
  `/api/cron/daily?only=support`.
- Agents can view all tickets in the tenant; only working them is limited to their own or unassigned.
- A business has one login, its owner. Team members are bookable people, not users.
- Lists filtered on more than one field scan up to 400 tickets per page. Metrics and queues read the
  first 500 open tickets, and say so when they stop there.
- SLA targets apply to a ticket when it opens or changes priority, not when the policy later changes.
- Rate limits count per person, not per IP.
- Attachments have no real antivirus. A scanner is the first Phase 2 security item.

## For legal review

- **IRC section 7216:** whether support staff seeing return status, and customers writing tax details
  into tickets, needs consent or a disclosure.
- **GLBA / FTC Safeguards Rule:** add this module to the written security plan.
- **Retention:** tickets have no deletion schedule yet. How long to keep them is a decision to make.
- **Redaction:** numbers shaped like an SSN or bank account are removed from tickets before storage, so
  the original is gone. Confirm this is acceptable for your records.

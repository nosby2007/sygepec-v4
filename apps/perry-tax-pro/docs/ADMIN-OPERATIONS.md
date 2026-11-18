# Staff operations

What the general admin and preparers do inside the app. See `SUPPORT-PHASE1.md` for tickets and SLA.

## Who can do what

The general admin is a `PREPARER` account holding `PLATFORM_ADMIN` in `taxSupportRoles`. Grant the first one
with `scripts/support-grant.mjs`, then manage others in Support Settings.

| Action | Preparer, not assigned | Assigned preparer | General admin |
|---|---|---|---|
| Search clients, open a file, run the account check | Yes | Yes | Yes |
| Open documents, messages or bank details | With a logged reason, 30 minutes | Yes | With a logged reason, 30 minutes |
| Change a return, post a message, upload or remove a document | | Yes | Yes |
| Change a fee, correct a return, send a follow-up, repair access | | Yes | Yes |
| Assign a preparer | | | Yes |
| Ask for a refund | | Yes | Yes |
| Approve and run a refund | | | Yes |
| Block or unblock an account | | | Yes |
| Create, deactivate or reactivate preparers, move their work | | | Yes |
| Give a task to someone else, see team reports | | | Yes |
| Change the website, booking settings or security | | | Yes |

Appointments stay shared: any preparer can act on any appointment, because scheduling is a front-desk job.

The server checks each rule. The Firestore rules repeat the return, message and document rules, because a
preparer's own token can reach Firestore directly.

The Storage rules hold to the same rule as the app: a preparer opens a return's files only when assigned to
it, as the general admin, or within 30 minutes of giving a reason for that client. Storage rules may read
only two documents, so the general admin flag, the block and the reasons are mirrored on the person's own
`taxUsers` record (`platformAdmin`, `blocked`, `fileGrants`), written only by the server. Only the assigned preparer and the general admin add or delete files. (Until the InnovaTax
security phase, any preparer's token could reach any return's files directly.)

## Data

All server-only: no rules, so the catch-all denies browsers.

| Collection | Holds |
|---|---|
| `taxTasks/{id}` | Work for one person, with a log of status changes and notes. |
| `taxRefunds/{id}` | One refund request, from asked to finished. |
| `taxCorrections/{id}` | Each correction, with the reason and values before and after. |
| `taxAccessGrants/{staff}_{client}` | The latest reason and when its 30 minutes end. |
| `taxAccountBlocks/{uid}` | A block. No document means not blocked. |

## Refunds

A preparer asks, and the general admin approves. A card payment made through the app goes back through Stripe.
Cash, check and office card payments are returned by hand, and the app records them.

The refund is claimed first, so two admins cannot run it at once. Its ID is Stripe's idempotency key, so
running it again cannot pay twice. If Stripe says no, it is marked failed. If Stripe does not answer, it stays
in process and can be run again. The refund and the fee are saved in one commit.

Refunds of business plans and business invoices are not here: use the Stripe dashboard. To record refunds
made in the Stripe dashboard, add the `charge.refunded` event to the platform webhook.

## Corrections

Each correction needs a reason. Signed or filed figures cannot change, since those need an amended return;
only the status can. The last four SSN digits and bank details cannot be changed here.

## Limits

- The sign-in email cannot be changed here. It needs `roles/firebaseauth.admin` on the server identity.
- A block ends the app session. The Firebase account itself stays enabled (disabling it needs
  `roles/firebaseauth.admin`), but the Firestore and Storage rules refuse every request from a blocked
  account, so its own token reaches nothing either. Unblocking restores access.
- The account check reads sign-ins from the log and cannot see the Firebase account itself.

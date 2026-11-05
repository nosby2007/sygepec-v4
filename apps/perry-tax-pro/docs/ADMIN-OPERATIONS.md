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

**Known limit:** a preparer's token can still reach Storage directly for a file on any return, since the
Storage rules still treat every preparer alike. The reason screen and the assignment are checked by the app.

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
- A block ends the app session, but the Firebase account stays enabled. A blocked client who calls Firestore
  directly with their own token can still reach their own records.
- The account check reads sign-ins from the log and cannot see the Firebase account itself.

import "server-only";
import { deleteDocument, deleteFirebaseAccount, getDocument, queryCollection, setDocument, signInWithPassword, TAX_TENANT } from "@/lib/firebase";
import { retainedReasons } from "@/lib/account-deletion-rules";
import { audit } from "@/lib/audit";
import { getSiteSettings } from "@/lib/cms";
import { mailerConfigured, sendEmail } from "@/lib/mailer";
import { serviceToken } from "@/lib/service-identity";

// Delete-my-account, asked for in the apps and on the web. An account with nothing to keep
// is removed at once. One with tax or business records becomes a request for staff, since
// those records must be kept (lib/automation.js RETENTION) and subscriptions and payment
// accounts need closing by a person. taxDeletionRequests/{uid} is server-only, like taxAudit.
export class AccountError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const owned = (collection, token, field, uid) =>
  queryCollection(collection, token, { filters: [[field, "EQUAL", uid], ["tenantId", "EQUAL", TAX_TENANT]], limit: 300 });

async function loadRecords(uid, token) {
  const [returns, charges, appointments, notes, bank, entries, customers, profile, billing] = await Promise.all([
    owned("taxReturns", token, "clientId", uid),
    owned("taxCharges", token, "clientId", uid),
    owned("taxAppointments", token, "clientId", uid),
    // Messages can hold a full SSN (see the Privacy Policy), so they are tax records to keep.
    owned("taxNotes", token, "clientId", uid),
    owned("taxBankDetails", token, "clientId", uid),
    owned("taxBusinessEntries", token, "ownerUid", uid),
    owned("taxBusinessCustomers", token, "ownerUid", uid),
    getDocument(`bizProfiles/${uid}`, token),
    getDocument(`taxBilling/${uid}`, token),
  ]);
  return { returns, charges, appointments, notes, bank, entries, customers, profile, billing };
}

export const pendingDeletion = async (uid) => getDocument(`taxDeletionRequests/${uid}`, await serviceToken());

// Pending requests for the staff security page.
export const deletionRequests = async () =>
  queryCollection("taxDeletionRequests", await serviceToken(), { filters: [["status", "EQUAL", "PENDING"]], limit: 100 });

async function removeNow(session, auth, records, token) {
  const [favorites, bookings] = await Promise.all([
    owned("clientFavorites", token, "ownerUid", session.uid),
    owned("clientBookings", token, "ownerUid", session.uid),
  ]);
  const paths = [
    ...records.returns.map((r) => `taxReturns/${r.id}`),
    ...favorites.map((r) => `clientFavorites/${r.id}`),
    ...bookings.map((r) => `clientBookings/${r.id}`),
    `taxMfa/${session.uid}`,
    `taxUsers/${session.uid}`,
  ];
  await Promise.all(paths.map((path) => deleteDocument(path, token)));
  await deleteFirebaseAccount(auth.idToken);
}

async function request(session, reasons, token) {
  await setDocument(`taxDeletionRequests/${session.uid}`, {
    tenantId: TAX_TENANT, uid: session.uid, name: session.name, email: session.email,
    accountType: session.accountType, reasons, status: "PENDING", requestedAt: new Date().toISOString(),
  }, token);
  if (!mailerConfigured()) return;
  const office = (await getSiteSettings().catch(() => null))?.email;
  await Promise.all([
    office && sendEmail({ to: office, subject: "Account deletion request", text: `${session.name} (${session.email}) asked to delete their account.\n\nRecords found: ${reasons.join(", ")}.\n\nSee Security in the staff workspace.` }),
    sendEmail({ to: session.email, subject: "We received your request to delete your account", text: `Hi ${session.name},\n\nWe received your request. We will delete your account and let you know within 30 days. Records the law requires us to keep, such as tax records, stay protected until that period ends.\n\nInnovaCare Tax` }),
  ]).catch(() => null);
}

// Returns "deleted" or "requested". The password is asked again so an open phone or a
// forgotten session cannot remove an account, and the fresh token lets Firebase delete it.
export async function deleteAccount(session, password) {
  if (session.role !== "CLIENT") throw new AccountError("Staff accounts are closed by the account owner.", 403);
  if (typeof password !== "string" || !password) throw new AccountError("Enter your password.");
  const auth = await signInWithPassword(session.email, password).catch(() => null);
  if (!auth?.idToken || auth.localId !== session.uid) throw new AccountError("That password is not correct.", 401);

  const token = await serviceToken();
  if (await pendingDeletion(session.uid).catch(() => null)) return "requested";
  // Fails closed: records that cannot be read count as records to keep.
  const records = await loadRecords(session.uid, token).catch(() => null);
  const reasons = records ? retainedReasons(records) : ["records could not be checked"];
  if (reasons.length) {
    await request(session, reasons, token);
    await audit(session, "ACCOUNT_DELETION_REQUESTED", { details: { reasons: reasons.join(", ") } });
    return "requested";
  }
  await audit(session, "ACCOUNT_DELETED");
  await removeNow(session, auth, records, token);
  return "deleted";
}

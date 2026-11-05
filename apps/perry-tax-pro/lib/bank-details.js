import "server-only";
import { deleteDocument, getDocument, setDocument, signInWithPassword, TAX_TENANT } from "@/lib/firebase";
import { audit } from "@/lib/audit";
import { bankKey, checkBankInput, sealBank, unsealBank } from "@/lib/bank-rules";
import { emailClient } from "@/lib/notifications";
import { serviceToken } from "@/lib/service-identity";

// Full routing and account numbers for direct deposit.
//   taxBankDetails/{returnId}   server-only (no security rules), written with the server identity.
// The numbers are encrypted before storage. Only the client can enter them and only a
// preparer can read them, each after giving their password again, and every read is logged.
// Without the key nothing is accepted or shown.
export class BankError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const key = () => bankKey(process.env.BANK_DETAILS_KEY);
export const bankAvailable = () => Boolean(key());

const view = (row) => row && {
  accountType: row.accountType, accountLast4: row.accountLast4, routingLast4: row.routingLast4, savedAt: row.savedAt,
};
const FINAL = ["FILED", "ACCEPTED"];

async function confirmPassword(session, password) {
  if (typeof password !== "string" || !password) throw new BankError("Enter your password.");
  const auth = await signInWithPassword(session.email, password).catch(() => null);
  if (!auth?.idToken || auth.localId !== session.uid) throw new BankError("That password is not correct.", 401);
}

export async function bankStatus(returnId) {
  const row = await getDocument(`taxBankDetails/${returnId}`, await serviceToken());
  return { available: bankAvailable(), saved: row?.tenantId === TAX_TENANT ? view(row) : null };
}

export async function saveBankDetails(session, r, input) {
  if (session.role !== "CLIENT" || r.client_id !== session.uid) throw new BankError("Only the client can enter bank details.", 403);
  const secret = key();
  if (!secret) throw new BankError("Secure bank entry is not available right now.", 503);
  const checked = checkBankInput(input);
  if (checked.error) throw new BankError(checked.error);
  await confirmPassword(session, input?.password);
  if (FINAL.includes(r.status)) throw new BankError("This return has been filed. Message your preparer about your refund.", 409);
  const token = await serviceToken();
  const existing = await getDocument(`taxBankDetails/${r.id}`, token);
  // The signed return must not change underneath Form 8879.
  if (existing && r.status === "READY_TO_SIGN") throw new BankError("Your return is ready to sign. Message your preparer to change your bank details.", 409);
  const row = {
    tenantId: TAX_TENANT, returnId: r.id, clientId: r.client_id, keyVersion: 1,
    sealed: sealBank(checked, r.id, secret),
    accountType: checked.accountType, accountLast4: checked.account.slice(-4), routingLast4: checked.routing.slice(-4),
    savedAt: new Date().toISOString(),
  };
  await setDocument(`taxBankDetails/${r.id}`, row, token);
  await audit(session, existing ? "BANK_DETAILS_CHANGED" : "BANK_DETAILS_SAVED", { target: `taxReturns/${r.id}` });
  // A changed account is how refunds get stolen, so the account owner always hears about it.
  await emailClient({
    to: session.email, name: session.name, link: "/portal/intake",
    subject: "Your direct deposit details were saved",
    text: "The bank details for your tax refund were just saved. If this was not you, contact us right away and change your password.",
  }).catch(() => null);
  return view(row);
}

export async function revealBankDetails(session, r, password) {
  if (session.role !== "PREPARER") throw new BankError("Only a preparer can open bank details.", 403);
  const secret = key();
  if (!secret) throw new BankError("Secure bank entry is not available right now.", 503);
  await confirmPassword(session, password);
  const row = await getDocument(`taxBankDetails/${r.id}`, await serviceToken());
  if (!row || row.tenantId !== TAX_TENANT) throw new BankError("No bank details on this return.", 404);
  let numbers;
  try {
    numbers = unsealBank(row.sealed, r.id, secret);
  } catch {
    throw new BankError("These bank details could not be opened. Ask the client to enter them again.", 500);
  }
  await audit(session, "BANK_DETAILS_VIEWED", { target: `taxReturns/${r.id}` });
  return { ...numbers, accountType: row.accountType };
}

export async function removeBankDetails(session, r, password) {
  await confirmPassword(session, password);
  if (session.role === "CLIENT" && FINAL.includes(r.status)) throw new BankError("This return has been filed. Message your preparer.", 409);
  await deleteDocument(`taxBankDetails/${r.id}`, await serviceToken());
  await audit(session, "BANK_DETAILS_REMOVED", { target: `taxReturns/${r.id}` });
}

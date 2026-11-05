// What stops an account being deleted at once. Pure, so it is unit-tested. A tax account
// starts with one empty return (app/api/auth/register), which does not count.
const untouched = (r) => r.status === "INTAKE" && !r.docCount && !r.intake?.submitted && !r.preparerId
  && (r.signatureStatus || "NOT_REQUESTED") === "NOT_REQUESTED";

export function retainedReasons({ returns = [], charges = [], appointments = [], entries = [], customers = [], notes = [], bank = [], profile = null, billing = null }) {
  return [
    returns.some((r) => !untouched(r)) && "tax return",
    charges.length > 0 && "fees or payments",
    appointments.length > 0 && "tax appointments",
    notes.length > 0 && "secure messages",
    bank.length > 0 && "bank details",
    profile && "business profile",
    (entries.length > 0 || customers.length > 0) && "business records",
    billing && "business plan",
  ].filter(Boolean);
}

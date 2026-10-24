// Seeds the local Firebase emulators with test accounts and a published demo business,
// for clicking through the app with `npm run dev:emulators`. Emulator only: it refuses to
// run unless the emulator hosts are set. Accounts (password in TEST_PASSWORD below):
//   owner@example.test (business), client@example.test (tax client), preparer@example.test
const required = ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"];
if (required.some((name) => !process.env[name])) throw new Error("Run against the emulators only.");

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-perry-tax";
const TEST_PASSWORD = "local-emulator-pass-123";
const T = "perry-tax-pro";
const fb = await import("@/lib/firebase");
const biz = await import("@/lib/business-booking");
const now = new Date().toISOString();

async function account(email, name) {
  const auth = await fb.signUpWithPassword(email, TEST_PASSWORD, name).catch(() => fb.signInWithPassword(email, TEST_PASSWORD));
  return { uid: auth.localId, idToken: auth.idToken, name, email };
}

const owner = await account("owner@example.test", "Dana Owner");
const client = await account("client@example.test", "Chris Client");
const preparer = await account("preparer@example.test", "Pat Preparer");
const profile = (a, role, accountType) => ({ uid: a.uid, name: a.name, email: a.email, phone: null, role, accountType, tenantId: T, createdAt: now, updatedAt: now });
await fb.setDocument(`taxUsers/${owner.uid}`, profile(owner, "CLIENT", "BUSINESS"), "owner");
await fb.setDocument(`taxUsers/${client.uid}`, profile(client, "CLIENT", "TAX"), "owner");
await fb.setDocument(`taxUsers/${preparer.uid}`, profile(preparer, "PREPARER", null), "owner");
const year = new Date().getUTCFullYear();
await fb.setDocument(`taxReturns/${client.uid}_${year}`, {
  tenantId: T, clientId: client.uid, clientName: client.name, clientEmail: client.email, clientPhone: null, preparerId: null, preparerName: null,
  signatureStatus: "NOT_REQUESTED", signatureMethod: "REMOTE", signatureRequestedAt: null, signedAt: null, submissionStatus: "NOT_READY",
  submissionReference: null, submissionNotes: null, submittedAt: null, acceptedAt: null, taxYear: year, status: "INTAKE", filingStatus: null,
  intake: {}, docCount: 0, createdAt: now, updatedAt: now,
}, "owner");

const session = { ...owner, id: owner.uid, role: "CLIENT", accountType: "BUSINESS" };
const weekdays = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [{ start: "09:00", end: "17:00" }]]));
await biz.saveProfile(session, {
  name: "Maple Street Studio", slug: "maple-street-studio", tagline: "Hair, colour and quiet appointments",
  description: "A small neighbourhood studio. Demo data for local testing.", phone: "555-0100", email: "studio@example.test",
  address: "12 Maple Street", city: "Springfield", state: "IL", zip: "62701",
  status: "PUBLISHED", publicBooking: true, autoConfirm: false,
  booking: { timeZone: "America/Chicago", slotMinutes: 30, minNoticeHours: 2, horizonDays: 30, cancelCutoffHours: 24, maxReschedules: 2, bufferMinutes: 0, capacity: 1, weekly: { ...weekdays, 6: [{ start: "10:00", end: "14:00" }] }, closedDates: [] },
});
for (const [id, name, price, minutes, description] of [["svc-cut", "Haircut", 4500, 45, "Wash, cut and style."], ["svc-colour", "Colour", 9000, 90, "Full colour with consultation."]]) {
  await fb.setDocument(`taxBusinessServices/${id}`, { tenantId: T, ownerUid: owner.uid, name, priceCents: price, durationMinutes: minutes, description, active: true, public: true, imagePath: null, createdAt: now, updatedAt: now }, owner.idToken);
}
const staff = await biz.listStaff(session);
if (!staff.length) {
  await biz.saveStaff(session, { name: "Alex Rivera", title: "Stylist", bio: "Ten years cutting hair." });
  await biz.saveStaff(session, { name: "Morgan Lee", title: "Colourist", serviceIds: ["svc-colour"], weekly: { 2: [{ start: "09:00", end: "13:00" }], 4: [{ start: "09:00", end: "13:00" }] } });
}
console.log("Seeded: owner, client and preparer accounts; business /business/maple-street-studio");

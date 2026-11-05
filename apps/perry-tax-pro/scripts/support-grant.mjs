// Gives a staff account a support role. This is how the first Platform Admin is created, and
// how new support staff are provisioned; after that, Support Settings can change roles.
//
//   $env:GCP_TOKEN = (gcloud auth print-access-token)
//   node scripts/support-grant.mjs <project-id> <email> <SUPPORT_AGENT|SUPPORT_SUPERVISOR|PLATFORM_ADMIN> [--dry-run]
//
// The person signs up first as usual. A CLIENT account with any return, ticket or business
// record is refused, so a customer's data can never end up behind a staff login. A PREPARER
// keeps that role and gains support access.
const [project, email, role, flag] = process.argv.slice(2);
const ROLES = ["SUPPORT_AGENT", "SUPPORT_SUPERVISOR", "PLATFORM_ADMIN"];
const token = process.env.GCP_TOKEN;
const dryRun = flag === "--dry-run";
if (!project || !email || !ROLES.includes(role) || !token) {
  console.error("Usage: GCP_TOKEN=... node scripts/support-grant.mjs <project-id> <email> <role> [--dry-run]");
  process.exit(1);
}
const TENANT = "perry-tax-pro";
const HOST = process.env.FIRESTORE_EMULATOR_HOST ? `http://${process.env.FIRESTORE_EMULATOR_HOST}` : "https://firestore.googleapis.com";
const FS = `${HOST}/v1/projects/${project}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const s = (v) => ({ stringValue: v });

async function query(collection, field, value, limit = 1) {
  const rows = await fetch(`${FS}:runQuery`, {
    method: "POST", headers,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: s(value) } }, limit } }),
  }).then((r) => r.json());
  if (!Array.isArray(rows)) throw new Error("The database refused the query. Check the project and your access.");
  return rows.filter((row) => row.document).map((row) => row.document);
}

// The empty return made at sign-up, with only the name and phone given then.
function untouchedReturn(f) {
  const intake = f.intake?.mapValue?.fields || {};
  const personal = intake.personal?.mapValue?.fields || {};
  return f.status?.stringValue === "INTAKE"
    && Number(f.docCount?.integerValue || 0) === 0
    && !f.preparerId?.stringValue
    && (f.signatureStatus?.stringValue || "NOT_REQUESTED") === "NOT_REQUESTED"
    && Object.keys(intake).every((k) => k === "personal")
    && Object.keys(personal).every((k) => ["firstName", "lastName", "phone"].includes(k));
}

// Ends by returning, not process.exit(), so open connections close cleanly.
async function main() {
  const users = (await query("taxUsers", "email", email.toLowerCase())).filter((u) => u.fields.tenantId?.stringValue === TENANT);
  if (users.length !== 1) { console.error("No account found for that email. They must sign up first."); return void (process.exitCode = 1); }
  const user = users[0];
  const uid = user.name.split("/").pop();
  const current = user.fields.role.stringValue;
  if (current === "CLIENT") {
    for (const r of await query("taxReturns", "clientId", uid, 20)) {
      if (!untouchedReturn(r.fields)) { console.error("Refused: this customer has started a tax return. Use a separate staff account."); return void (process.exitCode = 1); }
    }
    for (const [collection, field] of [["taxDocuments", "clientId"], ["taxNotes", "clientId"], ["taxCharges", "clientId"], ["taxAppointments", "clientId"], ["taxBankDetails", "clientId"], ["taxBusinessEntries", "ownerUid"], ["taxSupportTickets", "customerUid"]]) {
      if ((await query(collection, field, uid)).length) { console.error(`Refused: this customer account has records in ${collection}. Use a separate staff account.`); return void (process.exitCode = 1); }
    }
    if (user.fields.accountType?.stringValue === "BUSINESS") { console.error("Refused: this is a business account. Use a separate staff account."); return void (process.exitCode = 1); }
  }
  const now = new Date().toISOString();
  console.log(`${dryRun ? "Would give" : "Giving"} ${email} the role ${role}. Account role: ${current}${current === "CLIENT" ? " -> SUPPORT" : ""}.`);
  if (dryRun) return;
  if (current === "CLIENT") {
    const r = await fetch(`${FS}/taxUsers/${uid}?updateMask.fieldPaths=role&updateMask.fieldPaths=updatedAt&currentDocument.exists=true`, { method: "PATCH", headers, body: JSON.stringify({ fields: { role: s("SUPPORT"), updatedAt: s(now) } }) });
    if (!r.ok) { console.error("Could not change the account role."); return void (process.exitCode = 1); }
  }
  const fields = { tenantId: s(TENANT), uid: s(uid), name: s(user.fields.name?.stringValue || email), email: s(email.toLowerCase()), role: s(role), grantedBy: s("support-grant-script"), grantedAt: s(now) };
  const granted = await fetch(`${FS}/taxSupportRoles/${uid}`, { method: "PATCH", headers, body: JSON.stringify({ fields }) });
  if (!granted.ok) { console.error("Could not save the role."); return void (process.exitCode = 1); }
  await fetch(`${FS}/taxAudit/${Date.now()}_${crypto.randomUUID()}`, {
    method: "PATCH", headers,
    body: JSON.stringify({ fields: { tenantId: s(TENANT), area: s("SUPPORT"), at: s(now), action: s("SUPPORT_ROLE_CHANGED"), outcome: s("SUCCESS"), actorRole: s("SYSTEM"), target: s(`taxUsers/${uid}`), details: { mapValue: { fields: { to: s(role), via: s("support-grant-script") } } } } }),
  });
  console.log("Done. They set up two-step sign-in at their next sign-in, then open /admin/support.");
}

await main();

import { audit } from "@/lib/audit";
import { ownerRoute, readJson } from "@/lib/business-api";
import { BusinessError } from "@/lib/business-booking";
import { parseRegistrationUpdate } from "@/lib/business-registration";
import { getDocument, setDocument, TAX_TENANT } from "@/lib/firebase";
import { serviceToken } from "@/lib/service-identity";

// The owner's own company details. bizRegistrations is server-only: no browser reads it
// directly, so every access goes through this check of the signed-in owner.
function view(row) {
  if (!row) return null;
  const { id: _i, createTime: _c, updateTime: _u, ...data } = row;
  return data;
}

function ownerOnly(session) {
  if (session.accountType !== "BUSINESS") throw new BusinessError("Not a business account.", 403);
}

export const GET = (req) => ownerRoute(req, async (session) => {
  ownerOnly(session);
  return { registration: view(await getDocument(`bizRegistrations/${session.uid}`, await serviceToken()).catch(() => null)) };
});

export const PUT = (req) => ownerRoute(req, async (session) => {
  ownerOnly(session);
  const token = await serviceToken();
  const current = view(await getDocument(`bizRegistrations/${session.uid}`, token).catch(() => null)) || {};
  const { errors, registration } = parseRegistrationUpdate(await readJson(req), current);
  if (Object.keys(errors).length) throw new BusinessError(Object.values(errors).join(" "));
  const now = new Date().toISOString();
  const doc = { ...current, ...registration, tenantId: TAX_TENANT, uid: session.uid, termsVersion: current.termsVersion || registration.termsVersion, createdAt: current.createdAt || now, updatedAt: now };
  await setDocument(`bizRegistrations/${session.uid}`, doc, token);
  await audit(session, "BUSINESS_DETAILS_UPDATED", { target: `bizRegistrations/${session.uid}` });
  return { registration: doc };
}, { failure: "The business details could not be saved. Please try again." });

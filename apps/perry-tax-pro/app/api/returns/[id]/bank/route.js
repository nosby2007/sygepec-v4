import { getFirebaseSession } from "@/lib/auth";
import { BankError, bankStatus, removeBankDetails, revealBankDetails, saveBankDetails } from "@/lib/bank-details";
import { getReturnForSession } from "@/lib/data";
import { mutationGuard, privateHeaders } from "@/lib/security";

const json = (body, status = 200) => Response.json(body, { status, headers: privateHeaders });

// Request bodies hold full bank numbers, so they are never logged and errors never repeat them.
async function run(req, params, action) {
  const blocked = req.method === "GET" ? null : mutationGuard(req);
  if (blocked) return blocked;
  const session = await getFirebaseSession();
  // The database refuses another person's return, which is simply "not found" here.
  const r = await getReturnForSession((await params).id, session).catch(() => null);
  if (!r) return json({ error: "Not found" }, 404);
  if (session.role === "CLIENT" && session.accountType !== "TAX") return json({ error: "Not found" }, 404);
  const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
  try {
    return json(await action(session, r, body));
  } catch (error) {
    if (error instanceof BankError) return json({ error: error.message }, error.status);
    return json({ error: "That did not work. Please try again." }, 503);
  }
}

export const GET = (req, { params }) => run(req, params, (_s, r) => bankStatus(r.id));
export const PUT = (req, { params }) => run(req, params, async (s, r, b) => ({ saved: await saveBankDetails(s, r, b) }));
export const POST = (req, { params }) => run(req, params, (s, r, b) => revealBankDetails(s, r, b.password));
export const DELETE = (req, { params }) => run(req, params, async (s, r, b) => { await removeBankDetails(s, r, b.password); return { ok: true }; });

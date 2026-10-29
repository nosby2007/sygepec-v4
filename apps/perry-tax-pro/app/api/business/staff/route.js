import { ownerRoute, readJson } from "@/lib/business-api";
import { BusinessError, listStaff, saveStaff } from "@/lib/business-booking";
import { getEntitlement } from "@/lib/entitlements";
import { planName, teamLimit } from "@/lib/plans";

export const GET = (req) => ownerRoute(req, async (session) => ({ staff: await listStaff(session) }));

export const POST = (req) => ownerRoute(req, async (session) => {
  const ent = await getEntitlement(session.uid);
  const limit = teamLimit(ent);
  const active = (await listStaff(session)).filter((s) => s.active !== false).length;
  if (limit !== null && active >= limit) throw new BusinessError(`The ${planName(ent.plan)} plan includes up to ${limit} team member${limit === 1 ? "" : "s"}. Upgrade to Premium for more.`, 402);
  return { staff: await saveStaff(session, await readJson(req)) };
}, {
  failure: "The team member could not be saved.",
});

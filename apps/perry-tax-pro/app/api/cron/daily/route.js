import { createRemoteJWKSet, jwtVerify } from "jose";
import { runDaily, TASKS } from "@/lib/automation";
import { privateHeaders } from "@/lib/security";

// Called once a day by Cloud Scheduler with a Google-signed OIDC token for the scheduler's
// service account. Anything else is refused. ?dryRun=1 reports without sending.
const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const INVOKER = process.env.CRON_INVOKER || "perry-tax-pro-runtime@sygepec-v4.iam.gserviceaccount.com";

async function authorized(req) {
  const audience = process.env.CRON_AUDIENCE;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!audience || !token) return false;
  try {
    const { payload } = await jwtVerify(token, GOOGLE_KEYS, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience });
    return payload.email === INVOKER && payload.email_verified === true;
  } catch {
    return false;
  }
}

export async function POST(req) {
  if (!(await authorized(req))) return Response.json({ error: "Not found" }, { status: 404, headers: privateHeaders });
  const url = new URL(req.url);
  const only = url.searchParams.get("only")?.split(",").filter((t) => TASKS.includes(t));
  const result = await runDaily({ dryRun: url.searchParams.get("dryRun") === "1", only: only?.length ? only : TASKS });
  console.log(JSON.stringify({ event: "cron.daily", ...result }));
  return Response.json(result, { headers: privateHeaders });
}

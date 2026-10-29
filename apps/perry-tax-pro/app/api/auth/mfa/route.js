import { getPendingSession, setMfaState } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MfaError, disable, finishSetup, mfaRequired, mfaStatus, newRecoverySet, startSetup, verifyCode } from "@/lib/mfa";
import { ServiceIdentityError } from "@/lib/service-identity";
import { mutationGuard, privateHeaders } from "@/lib/security";
import { mfaPending } from "@/lib/session-token";

const json = (body, status = 200) => Response.json(body, { status, headers: privateHeaders });

// body: { action, code? }
//   status | setup | enable   while signing in ("setup") or from the security page
//   verify                    the second step of a sign-in
//   recovery | disable        from the security page (signed in fully)
export async function POST(req) {
  const blocked = mutationGuard(req);
  if (blocked) return blocked;
  const session = await getPendingSession();
  if (!session) return json({ error: "Please log in again." }, 401);
  const actor = { uid: session.uid, role: session.role, email: session.email };
  const pending = mfaPending(session);
  const body = await req.json().catch(() => ({}));
  try {
    switch (body.action) {
      case "status":
        return json(await mfaStatus(session.uid));
      case "setup":
        return json(await startSetup(session.uid, session.email));
      case "enable": {
        const result = await finishSetup(session.uid, body.code);
        await audit(actor, "MFA_ENABLED");
        if (pending) await setMfaState("ok");
        return json(result);
      }
      case "verify": {
        if (!pending) return json({ ok: true });
        if (!(await mfaStatus(session.uid)).enabled && !mfaRequired(session.role)) {
          await setMfaState("ok");
          return json({ ok: true });
        }
        const result = await verifyCode(session.uid, body.code);
        await audit(actor, result.recoveryUsed ? "MFA_RECOVERY_USED" : "MFA_PASSED", { details: result.recoveryUsed ? { recoveryLeft: result.recoveryLeft } : {} });
        await setMfaState("ok");
        return json({ ok: true, recoveryLeft: result.recoveryLeft ?? null });
      }
      case "recovery":
        if (pending) return json({ error: "Finish signing in first." }, 401);
        return json(await newRecoverySet(session.uid, body.code));
      case "disable":
        if (pending) return json({ error: "Finish signing in first." }, 401);
        await disable(session.uid, session.role, body.code);
        await audit(actor, "MFA_DISABLED");
        return json({ ok: true });
      default:
        return json({ error: "Unsupported action." }, 400);
    }
  } catch (error) {
    if (error instanceof MfaError) {
      if (["verify", "recovery", "disable"].includes(body.action)) await audit(actor, error.status === 429 ? "MFA_LOCKED" : "MFA_FAILED", { details: { action: body.action } });
      return json({ error: error.message }, error.status);
    }
    if (error instanceof ServiceIdentityError) return json({ error: "Two-step sign-in is temporarily unavailable. Please try again in a minute." }, 503);
    return json({ error: "Something went wrong. Please try again." }, 503);
  }
}

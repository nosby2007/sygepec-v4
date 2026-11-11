import { redirect } from "next/navigation";
import { appMode, getPendingSession, signInPath } from "@/lib/auth";
import { appHome } from "@/lib/app-mode";
import { mfaRequired, mfaStatus } from "@/lib/mfa";
import { safeNext } from "@/lib/idle";
import { mfaPending } from "@/lib/session-token";
import { TwoStepSignIn } from "@/components/TwoStep";

export const metadata = { title: "Two-step sign-in", robots: { index: false } };

const homeOf = (s) => (s.role === "SUPPORT" ? "/admin/support" : s.role === "PREPARER" ? "/admin" : s.accountType === "BUSINESS" ? "/portal/business" : "/portal");

export default async function Page({ searchParams }) {
  const session = await getPendingSession();
  if (!session) redirect(await signInPath());
  // Inside the native apps the user lands back in the app, not the web portal.
  const app = session.role === "PREPARER" || session.role === "SUPPORT" ? null : await appMode();
  const home = app ? appHome(app) : homeOf(session);
  const asked = safeNext((await searchParams)?.next);
  // The app (/m) opens the right screens for any account, so its paths are always fine.
  const next = asked && (asked.startsWith(home) || asked === "/m" || asked.startsWith("/m/")) ? asked : home;
  if (!mfaPending(session)) redirect(next);
  const status = await mfaStatus(session.uid).catch(() => null);
  if (!status) redirect("/signed-out?reason=expired");
  // "continue": turned off (or reset) since this sign-in started; nothing left to check.
  const mode = status.enabled ? "verify" : mfaRequired(session.role) ? "setup" : "continue";
  return <TwoStepSignIn mode={mode} next={next} />;
}

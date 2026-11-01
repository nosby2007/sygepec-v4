import { redirect } from "next/navigation";
import { getPendingSession } from "@/lib/auth";
import { mfaRequired, mfaStatus } from "@/lib/mfa";
import { safeNext } from "@/lib/idle";
import { mfaPending } from "@/lib/session-token";
import { TwoStepSignIn } from "@/components/TwoStep";

export const metadata = { title: "Two-step sign-in", robots: { index: false } };

const homeOf = (s) => (s.role === "PREPARER" ? "/admin" : s.accountType === "BUSINESS" ? "/portal/business" : "/portal");

export default async function Page({ searchParams }) {
  const session = await getPendingSession();
  if (!session) redirect("/login");
  const home = homeOf(session);
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

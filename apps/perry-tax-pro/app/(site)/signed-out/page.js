import Link from "next/link";
import Icon from "@/components/Icon";
import { IDLE_MINUTES, safeNext } from "@/lib/idle";

export const metadata = { title: "Signed out", robots: { index: false } };

const MESSAGES = {
  idle: {
    icon: "clock",
    title: "You were signed out to keep your information safe",
    text: `There was no activity for ${IDLE_MINUTES} minutes, so we closed your session. Your tax documents, answers and messages are saved exactly as you left them.`,
  },
  manual: {
    icon: "check",
    title: "You are signed out",
    text: "Thanks for stopping by. If you are on a shared or public computer, close this browser window as well.",
  },
  signed: {
    icon: "check",
    title: "Thank you, your signature was received",
    text: "Your preparer has been notified. Once every signer has signed, your return can be e-filed. You can close this window.",
  },
  expired: {
    icon: "lock",
    title: "Your session has ended",
    text: "For your security, sessions end after a while. Sign in again to continue where you left off.",
  },
};

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const m = MESSAGES[params?.reason] || MESSAGES.expired;
  const next = safeNext(params?.next);
  return (
    <main className="signed-out">
      <div className="signed-out-card">
        <span className="signed-out-icon"><Icon name={m.icon} size={30} /></span>
        <h1>{m.title}</h1>
        <p>{m.text}</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link id="sign-in-again" href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="btn btn-primary btn-lg">Sign in again</Link>
          <Link href="/" className="btn btn-ghost btn-lg">Go to the home page</Link>
        </div>
        <ul className="signed-out-tips">
          <li><Icon name="shield" size={16} /> Sessions close after {IDLE_MINUTES} minutes without activity.</li>
          <li><Icon name="lock" size={16} /> We never ask for your password by email or text.</li>
        </ul>
      </div>
    </main>
  );
}

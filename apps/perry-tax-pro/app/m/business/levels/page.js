import Link from "next/link";
import { getFirebaseSession } from "@/lib/auth";
import { loadBusinessHome } from "@/lib/mobile-business";
import Icon from "@/components/Icon";

export const metadata = { title: "Growth levels" };

export default async function Page() {
  const { growth } = await loadBusinessHome(await getFirebaseSession());
  return (
    <main className="m-main">
      <div className="m-head"><Link className="m-back" href="/m/business/profile"><Icon name="back" size={24} /> Growth levels</Link></div>
      <p className="m-sub">Each level is a short list of steps that bring in more clients. Finish one to unlock the next.</p>
      <div className="m-levels">
        {growth.levels.map((l) => (
          <Link key={l.key} href={`/m/business/levels/${l.key.toLowerCase()}`} className={`m-card m-level-card ${l.locked ? "locked" : ""}`}>
            <div style={{ flex: 1 }}>
              <h3>{l.title}</h3>
              <p>{l.complete ? "Completed" : l.locked ? "Locked" : `${l.doneCount} of ${l.total} completed`}</p>
              {!l.complete && !l.locked && <div className="m-progress"><i style={{ width: `${(l.doneCount / l.total) * 100}%` }} /></div>}
            </div>
            {l.complete ? <span className="m-orb" style={{ width: 44, height: 44, color: "var(--green)" }}><Icon name="check" size={30} stroke={2.4} /></span>
              : l.locked ? <span className="m-icon-btn"><Icon name="lock" size={20} /></span>
              : <Icon name="chevron" size={22} />}
          </Link>
        ))}
      </div>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getFirebaseSession } from "@/lib/auth";
import { loadBusinessHome } from "@/lib/mobile-business";
import Icon from "@/components/Icon";

export const metadata = { title: "Growth level" };

export default async function Page({ params }) {
  const key = String((await params).level || "").toUpperCase();
  const { growth } = await loadBusinessHome(await getFirebaseSession());
  const level = growth.levels.find((l) => l.key === key);
  if (!level) notFound();
  return (
    <main className="m-main">
      <div className="m-level-hero">
        <Link className="m-back" href="/m/business/levels" style={{ color: "#fff", fontSize: 16 }}><Icon name="back" size={22} /> All levels</Link>
        <h1>{level.title}</h1>
        <div>{level.complete ? "Completed" : level.locked ? "Locked: finish the level before this one first" : `${level.doneCount} of ${level.total} completed`}</div>
      </div>
      <div className="m-progress" style={{ marginTop: 0 }}><i style={{ width: `${(level.doneCount / level.total) * 100}%` }} /></div>
      <p className="m-gap" style={{ fontSize: 17, lineHeight: 1.5 }}>{level.pitch}</p>
      <div className="m-section"><h2>Steps to complete</h2></div>
      <ul className="m-steps">
        {level.steps.map((s) => (
          <li key={s.key} className={s.done ? "" : "todo"}>
            <i>{s.done ? <Icon name="check" size={20} stroke={2.4} /> : <Icon name="target" size={18} />}</i>
            <div>
              <b>{s.label}</b>
              {s.done ? <small>Completed</small> : <Link href={s.href}>Do it now <Icon name="chevron" size={12} /></Link>}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

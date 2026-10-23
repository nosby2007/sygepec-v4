import { requireTaxClient } from "@/lib/auth";
import { getClientReturn, listNotes } from "@/lib/data";
import Messages from "@/components/Messages";
import Icon from "@/components/Icon";
import { Avatar, PageHead } from "@/components/ui";

export default async function Page() {
  const s = await requireTaxClient();
  const r = await getClientReturn(s.id);
  if (!r) return <p>No return found. Please contact support.</p>;
  const notes = await listNotes(r.id);
  const who = r.preparer_name || "the InnovaCare team";
  return (
    <>
      <PageHead kicker="Secure inbox" icon="chat" title="Messages" desc={`Secure conversation with ${who}`} />
      <div className="grid-main" style={{ gridTemplateColumns: "minmax(0,1fr) 300px", alignItems: "start" }}>
        <div className="card">
          <div className="card-title">
            <div className="person"><Avatar name={who} /><div><b>{who}</b><span className="tiny muted" style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="live-dot" /> Typically replies within 1 business day</span></div></div>
            <span className="pill">{notes.length} message{notes.length === 1 ? "" : "s"}</span>
          </div>
          <Messages returnId={r.id} notes={notes} meId={s.id} />
        </div>
        <aside className="stack">
          <div className="card">
            <div className="icon-badge teal"><Icon name="shield" size={22} /></div>
            <h3>Private by design</h3>
            <p className="small">Messages are tied to your Tax Year {r.tax_year} return and visible only to you and your preparer.</p>
          </div>
          <div className="card">
            <h3>Good to include</h3>
            <ul className="feature-list" style={{ marginTop: 10 }}>
              {["Questions about a missing form", "Life changes (move, new job, baby)", "Best times to sign Form 8879"].map((t) => <li key={t} className="small"><Icon name="check" size={16} />{t}</li>)}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}

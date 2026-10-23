import { requireRole } from "@/lib/auth";
import { getClientReturn, listNotes } from "@/lib/data";
import Messages from "@/components/Messages";

export default async function Page() {
  const s = await requireRole("CLIENT");
  const r = await getClientReturn(s.id);
  if (!r) return <p>No return found. Please contact support.</p>;
  const notes = await listNotes(r.id);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p className="small">Secure conversation with {r.preparer_name || "the InnovaCare team"}</p>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 820 }}>
        <Messages returnId={r.id} notes={notes} meId={s.id} />
      </div>
    </>
  );
}

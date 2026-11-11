import Link from "next/link";
import Icon from "@/components/Icon";
import { Empty, PageHead } from "@/components/ui";
import { searchClients } from "@/lib/admin-clients";
import { getFirebaseSession, requireRole } from "@/lib/auth";

export const metadata = { title: "Clients" };

export default async function Page({ searchParams }) {
  await requireRole("PREPARER");
  const session = await getFirebaseSession();
  const q = String((await searchParams)?.q || "").slice(0, 100);
  const clients = q ? await searchClients(session, q) : [];
  return (
    <>
      <PageHead kicker="Staff" icon="users" title="Clients" desc="Find a client by name, email or phone, then open the full file. Every search and opening is logged." />
      <form className="card row" action="/admin/clients">
        <input id="client-q" aria-label="Search clients" name="q" className="input" style={{ flex: 1 }} defaultValue={q} placeholder="Name, email or phone" />
        <button className="btn btn-primary"><Icon name="search" size={16} /> Search</button>
      </form>
      {q && (clients.length === 0
        ? <div className="card mt"><Empty icon="search" title="No client found">Try a full last name, email or phone number.</Empty></div>
        : <div className="card mt table-wrap"><table>
            <thead><tr><th>Client</th><th>Email</th><th>Phone</th><th>Type</th><th /></tr></thead>
            <tbody>{clients.map((c) => (
              <tr key={c.uid}>
                <td><b>{c.name || "No name"}</b>{c.businessName && <div className="small">{c.businessName}</div>}</td>
                <td className="small">{c.email}</td><td className="small">{c.phone || "—"}</td>
                <td className="small">{c.type === "BUSINESS" ? "Business" : "Individual"}</td>
                <td><Link className="btn btn-ghost btn-sm" href={`/admin/clients/${c.uid}`}>Open file <Icon name="arrow" size={14} /></Link></td>
              </tr>
            ))}</tbody>
          </table></div>)}
    </>
  );
}

import Link from "next/link";
import crypto from "node:crypto";
import { Empty, PageHead } from "@/components/ui";
import { rateLimit, RATES, requireSupportPage } from "@/lib/support-access";
import { searchCustomers } from "@/lib/support-customers";
import { PERMISSIONS as P } from "@/lib/support-rules";

export const metadata = { title: "Customers" };

export default async function Page({ searchParams }) {
  const session = await requireSupportPage(P.CUSTOMER_SEARCH);
  const q = String((await searchParams)?.q || "").slice(0, 120);
  if (q) await rateLimit(session.uid, "customer.search", RATES.search);
  const { customers } = q ? await searchCustomers(session, q, crypto.randomUUID()) : { customers: [] };
  return (
    <>
      <PageHead kicker="Support Operations" icon="users" title="Customers" desc="Find a person or a business by name, email or phone." />
      <form className="card row" action="/admin/support/customers" role="search">
        <input aria-label="Name, email or phone" id="c-search" className="input" style={{ maxWidth: 420 }} name="q" defaultValue={q} placeholder="Name, email or phone" autoComplete="off" />
        <button type="submit" className="btn btn-primary btn-sm">Search</button>
      </form>
      <div className="card mt">
        {!q ? <Empty icon="search" title="Search to begin">Searches are logged.</Empty>
          : customers.length === 0 ? <Empty icon="users" title="No customer found">Check the spelling, or try the email or phone.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Customer</th><th>Type</th><th>Email</th><th>Phone</th></tr></thead>
              <tbody>{customers.map((c) => (
                <tr key={c.uid}>
                  <td><Link href={`/admin/support/customers/${c.uid}`} className="grad-text"><b>{c.name || "No name"}</b></Link>{c.businessName && <div className="tiny muted">{c.businessName}</div>}</td>
                  <td className="small">{c.type === "BUSINESS" ? "Business" : "Individual"}</td>
                  <td className="small">{c.email || "—"}</td>
                  <td className="small">{c.phone || "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
      </div>
    </>
  );
}

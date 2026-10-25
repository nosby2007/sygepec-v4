import Link from "next/link";
import { getFirebaseSession } from "@/lib/auth";
import { listAllEntries, listMessages } from "@/lib/cms";
import { CMS_TYPES, liveStatus } from "@/lib/cms-shared";
import Icon from "@/components/Icon";
import { Empty, PageHead } from "@/components/ui";
import StarterButton from "./StarterButton";

export const metadata = { title: "Website content" };

export default async function Page({ searchParams }) {
  const session = await getFirebaseSession();
  const [entries, messages] = await Promise.all([listAllEntries(session), listMessages(session)]);
  const type = CMS_TYPES[(await searchParams)?.type] ? (await searchParams).type : "ALL";
  const nowMs = new Date().getTime();
  const shown = entries.filter((e) => type === "ALL" || e.type === type);
  const unread = messages.filter((m) => m.status === "NEW").length;

  return (
    <>
      <PageHead kicker="Website" icon="megaphone" title="Website content" desc="Pages, services, blog, updates and team. Nothing is public until you publish it.">
        <Link href="/admin/content/messages" className="btn btn-ghost"><Icon name="mail" size={16} /> Messages{unread ? ` (${unread})` : ""}</Link>
        <Link href="/admin/content/settings" className="btn btn-ghost"><Icon name="phone" size={16} /> Contact details</Link>
      </PageHead>
      <div className="row between">
        <div className="seg">
          {["ALL", ...Object.keys(CMS_TYPES)].map((key) => (
            <Link key={key} href={key === "ALL" ? "/admin/content" : `/admin/content?type=${key}`} className={type === key ? "on" : ""}>
              {key === "ALL" ? "All" : CMS_TYPES[key].plural}<span className="count">{key === "ALL" ? entries.length : entries.filter((e) => e.type === key).length}</span>
            </Link>
          ))}
        </div>
        <div className="row">
          {Object.entries(CMS_TYPES).map(([key, t]) => (
            <Link key={key} href={`/admin/content/new?type=${key}`} className="btn btn-ghost btn-sm" id={`new-${key.toLowerCase()}`}><Icon name="plus" size={14} /> {t.label}</Link>
          ))}
        </div>
      </div>
      <div className="card mt">
        {shown.length === 0 && (
          <Empty icon="file" title="No content yet">
            Start from drafts based on the services already on your home page, then edit and publish them.
          </Empty>
        )}
        {entries.length === 0 && <div className="center"><StarterButton /></div>}
        <div className="stack-sm">
          {shown.map((e) => {
            const status = liveStatus(e, nowMs);
            return (
              <Link key={e.id} href={`/admin/content/${e.id}`} className="list-item clickable" style={{ color: "inherit" }}>
                <div style={{ minWidth: 0 }}>
                  <b>{e.title}</b>
                  <div className="hint truncate">{CMS_TYPES[e.type].label} · {CMS_TYPES[e.type].path(e.slug)} · v{e.version} by {e.updatedByName}</div>
                </div>
                <div className="row nowrap">
                  {e.status === "SCHEDULED" && status === "SCHEDULED" && <span className="small muted">{new Date(e.visibleFrom).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
                  <span className={`badge s-${status}`}>{status.toLowerCase()}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      {entries.length > 0 && <div className="mt"><StarterButton subtle /></div>}
    </>
  );
}

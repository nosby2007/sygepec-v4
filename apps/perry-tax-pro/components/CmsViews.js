import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/Icon";
import Markdown from "@/components/Markdown";
import { mediaUrl } from "@/lib/business-display";

// Renderers shared by the public pages and the admin preview, so a preview always
// looks exactly like the published page.

export const longDate = (value) => (value ? new Date(value).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");

export function PageHero({ eyebrow, title, summary, children }) {
  return (
    <div className="section-head" style={{ textAlign: "left", marginLeft: 0, maxWidth: 780 }}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)", margin: "14px 0 10px" }}>{title}</h1>
      {summary && <p className="lead" style={{ margin: 0 }}>{summary}</p>}
      {children}
    </div>
  );
}

export function ServiceArticle({ entry }) {
  const f = entry.fields || {};
  return (
    <article className="stack">
      <PageHero eyebrow="Service" title={entry.title} summary={entry.summary}>
        <div className="row mt"><Link href={f.ctaHref || "/book"} className="btn btn-primary btn-lg"><Icon name="calendar" size={18} /> {f.ctaLabel || "Book an appointment"}</Link></div>
      </PageHero>
      {entry.imagePath && <Image unoptimized src={mediaUrl(entry.imagePath)} alt="" width={1200} height={500} className="cms-cover" />}
      <div className="grid-main" style={{ alignItems: "start" }}>
        <div className="stack">
          {entry.body && <div className="card"><Markdown text={entry.body} /></div>}
          {f.steps?.length > 0 && (
            <div className="card">
              <h2>How it works</h2>
              <ol className="cms-steps">
                {f.steps.map((s, i) => <li key={i}><b>{s.title}</b>{s.text && <p className="small">{s.text}</p>}</li>)}
              </ol>
            </div>
          )}
          {f.faqs?.length > 0 && (
            <div className="card">
              <h2>Questions</h2>
              <div className="stack-sm">
                {f.faqs.map((q, i) => (
                  <details key={i} className="cms-faq"><summary>{q.q}</summary><p className="small">{q.a}</p></details>
                ))}
              </div>
            </div>
          )}
        </div>
        {f.benefits?.length > 0 && (
          <aside className="card">
            <h3>What you get</h3>
            <ul className="feature-list">{f.benefits.map((b, i) => <li key={i}><Icon name="check" size={18} /><span>{b}</span></li>)}</ul>
            <Link href={f.ctaHref || "/book"} className="btn btn-primary btn-block mt">{f.ctaLabel || "Book an appointment"}</Link>
          </aside>
        )}
      </div>
    </article>
  );
}

export function PostArticle({ entry }) {
  return (
    <article className="stack" style={{ maxWidth: 780 }}>
      <PageHero eyebrow="Blog" title={entry.title} summary={entry.summary}>
        <p className="small muted mt-sm">{[entry.fields?.author, longDate(entry.publishedAt || entry.visibleFrom)].filter(Boolean).join(" · ")}</p>
      </PageHero>
      {entry.imagePath && <Image unoptimized src={mediaUrl(entry.imagePath)} alt="" width={1200} height={500} className="cms-cover" />}
      <div className="card"><Markdown text={entry.body} /></div>
      {entry.fields?.tags?.length > 0 && <div className="row">{entry.fields.tags.map((t) => <span key={t} className="pill">{t}</span>)}</div>}
      <p className="hint">General information, not tax advice for your situation. Talk to a preparer before acting on it.</p>
    </article>
  );
}

export function PageArticle({ entry }) {
  return (
    <article className="stack" style={{ maxWidth: 820 }}>
      <PageHero title={entry.title} summary={entry.summary} />
      {entry.imagePath && <Image unoptimized src={mediaUrl(entry.imagePath)} alt="" width={1200} height={500} className="cms-cover" />}
      {entry.body && <div className="card"><Markdown text={entry.body} /></div>}
    </article>
  );
}

export function TeamCard({ entry }) {
  const f = entry.fields || {};
  return (
    <div className="card stack-sm">
      <div className="person" style={{ alignItems: "center" }}>
        {entry.imagePath
          ? <Image unoptimized src={mediaUrl(entry.imagePath)} alt={entry.title} width={64} height={64} className="biz-thumb" style={{ width: 64, height: 64, borderRadius: "50%" }} />
          : <span className="avatar c3" style={{ width: 64, height: 64, fontSize: "1.4rem" }}>{entry.title[0]}</span>}
        <div><h3 style={{ margin: 0 }}>{entry.title}</h3>{f.role && <div className="small muted">{f.role}</div>}</div>
      </div>
      {f.credentials && f.credentialsVerified && <span className="pill info" style={{ alignSelf: "flex-start" }}><Icon name="shield" size={12} /> {f.credentials}</span>}
      {entry.summary && <p className="small" style={{ margin: 0 }}>{entry.summary}</p>}
      {entry.body && <Markdown text={entry.body} className="prose small" />}
    </div>
  );
}

export function UpdateItem({ entry }) {
  return (
    <article id={entry.slug} className="card stack-sm">
      <span className="small muted">{longDate(entry.publishedAt || entry.visibleFrom)}</span>
      <h2 style={{ margin: 0, fontSize: "1.3rem" }}>{entry.title}</h2>
      {entry.summary && <p style={{ margin: 0 }}>{entry.summary}</p>}
      {entry.body && <Markdown text={entry.body} />}
    </article>
  );
}

export function PostCard({ entry }) {
  return (
    <Link href={`/blog/${entry.slug}`} className="card card-hover stack-sm" style={{ color: "inherit" }}>
      {entry.imagePath && <Image unoptimized src={mediaUrl(entry.imagePath)} alt="" width={600} height={260} className="cms-cover" />}
      <span className="small muted">{longDate(entry.publishedAt || entry.visibleFrom)}</span>
      <h3 style={{ margin: 0 }}>{entry.title}</h3>
      {entry.summary && <p className="small" style={{ margin: 0 }}>{entry.summary}</p>}
      <span className="small grad-text" style={{ fontWeight: 600 }}>Read more →</span>
    </Link>
  );
}

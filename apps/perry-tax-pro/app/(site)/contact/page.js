import Icon from "@/components/Icon";
import Markdown from "@/components/Markdown";
import { PageHero } from "@/components/CmsViews";
import { CONTACT_TOPICS, getSiteSettings, publicEntry } from "@/lib/cms";
import ContactForm from "./ContactForm";

export const metadata = {
  title: "Contact",
  description: "Get in touch with InnovaCare Tax.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const [page, site] = await Promise.all([publicEntry("PAGE", "contact"), getSiteSettings()]);
  return (
    <main className="section container" style={{ paddingTop: 48 }}>
      <PageHero eyebrow="Contact" title={page?.title || "Get in touch"} summary={page?.summary || "Send us a message and we'll get back to you."} />
      <div className="grid-main" style={{ alignItems: "start" }}>
        <ContactForm topics={CONTACT_TOPICS} />
        <aside className="stack">
          {(site.phone || site.email || site.address || site.hours) && (
            <div className="card stack-sm">
              <h3>Reach us</h3>
              {site.phone && <a href={`tel:${site.phone.replace(/[^\d+]/g, "")}`} className="row nowrap small"><Icon name="phone" size={15} />{site.phone}</a>}
              {site.email && <a href={`mailto:${site.email}`} className="row nowrap small"><Icon name="mail" size={15} />{site.email}</a>}
              {site.address && <span className="row nowrap small"><Icon name="building" size={15} />{site.address}</span>}
              {site.hours && <span className="row nowrap small"><Icon name="clock" size={15} />{site.hours}</span>}
            </div>
          )}
          {page?.body && <div className="card"><Markdown text={page.body} /></div>}
        </aside>
      </div>
    </main>
  );
}

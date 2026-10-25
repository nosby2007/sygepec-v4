import { publishedBusinesses } from "@/lib/business-booking";
import { publicEntries } from "@/lib/cms";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";
const url = (path) => new URL(path, SITE).toString();

export const dynamic = "force-dynamic";

// Public, indexable pages only: no portal, admin, API or private booking links.
export default async function sitemap() {
  const [services, posts, pages, team, updates, businesses] = await Promise.all([
    publicEntries("SERVICE"), publicEntries("POST"), publicEntries("PAGE"), publicEntries("TEAM"), publicEntries("UPDATE"), publishedBusinesses(),
  ]);
  const fixed = ["/", "/services", "/blog", "/estimator", "/business", "/business/directory", "/contact", "/login", "/register"];
  if (team.length) fixed.push("/team");
  if (updates.length) fixed.push("/updates");
  return [
    ...fixed.map((path) => ({ url: url(path), changeFrequency: "weekly" })),
    ...pages.filter((p) => p.slug !== "contact").map((p) => ({ url: url(`/${p.slug}`), lastModified: p.updatedAt })),
    ...services.map((s) => ({ url: url(`/services/${s.slug}`), lastModified: s.updatedAt })),
    ...posts.map((p) => ({ url: url(`/blog/${p.slug}`), lastModified: p.updatedAt })),
    ...businesses.map((b) => ({ url: url(`/business/${b.slug}`) })),
  ];
}

import { publishedBusinesses } from "@/lib/business-booking";
import { mediaUrl } from "@/lib/business-display";
import { publicEntries } from "@/lib/cms";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://innovacaresoftware.com";
const url = (path) => new URL(path, SITE).toString();
const image = (path) => [url(path)];
const entryImages = (entry, fallback) => image(entry.imagePath ? mediaUrl(entry.imagePath) : fallback);

export const dynamic = "force-dynamic";

// Public, indexable pages only: no portal, admin, API or private booking links.
export default async function sitemap() {
  const [services, posts, pages, team, updates, businesses] = await Promise.all([
    publicEntries("SERVICE"), publicEntries("POST"), publicEntries("PAGE"), publicEntries("TEAM"), publicEntries("UPDATE"), publishedBusinesses(),
  ]);
  const fixed = [
    { path: "/", changeFrequency: "weekly", priority: 1, images: image("/photos/consult.jpg") },
    { path: "/services", changeFrequency: "monthly", priority: 0.9, images: image("/photos/family.jpg") },
    { path: "/blog", changeFrequency: "weekly", priority: 0.8, images: image("/photos/paperwork.jpg") },
    { path: "/estimator", changeFrequency: "monthly", priority: 0.8, images: image("/photos/paperwork.jpg") },
    { path: "/business", changeFrequency: "monthly", priority: 0.9, images: image("/photos/shop.jpg") },
    { path: "/business/directory", changeFrequency: "weekly", priority: 0.8, images: image("/photos/owner.jpg") },
    { path: "/contact", changeFrequency: "monthly", priority: 0.7, images: image("/photos/consult.jpg") },
  ];
  if (team.length) fixed.push({ path: "/team", changeFrequency: "monthly", priority: 0.6, images: image("/photos/consult.jpg") });
  if (updates.length) fixed.push({ path: "/updates", changeFrequency: "weekly", priority: 0.7, images: image("/photos/paperwork.jpg") });
  return [
    ...fixed.map(({ path, ...entry }) => ({ url: url(path), ...entry })),
    ...pages.filter((p) => p.slug !== "contact").map((p) => ({ url: url(`/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "monthly", priority: 0.6, images: entryImages(p, "/photos/consult.jpg") })),
    ...services.map((s) => ({ url: url(`/services/${s.slug}`), lastModified: s.updatedAt, changeFrequency: "monthly", priority: 0.8, images: entryImages(s, "/photos/family.jpg") })),
    ...posts.map((p) => ({ url: url(`/blog/${p.slug}`), lastModified: p.updatedAt, changeFrequency: "monthly", priority: 0.7, images: entryImages(p, "/photos/paperwork.jpg") })),
    ...businesses.map((b) => ({ url: url(`/business/${b.slug}`), changeFrequency: "weekly", priority: 0.7, images: image(b.coverPath ? mediaUrl(b.coverPath) : "/photos/owner.jpg") })),
  ];
}

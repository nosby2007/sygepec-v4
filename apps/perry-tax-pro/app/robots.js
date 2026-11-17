const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://innovacaresoftware.com";

export default function robots() {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/portal/", "/api/", "/m/", "/login", "/register", "/business/register", "/business/*/booking/", "/pay/", "/feedback/", "/unsubscribe/"],
    }],
    sitemap: new URL("/sitemap.xml", SITE).toString(),
    host: SITE,
  };
}

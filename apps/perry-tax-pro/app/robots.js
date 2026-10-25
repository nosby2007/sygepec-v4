const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/portal", "/api/", "/business/*/booking/"] }],
    sitemap: new URL("/sitemap.xml", SITE).toString(),
  };
}

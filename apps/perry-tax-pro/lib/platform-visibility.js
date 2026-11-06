// What the InnovaCare Software pages show: a section with nothing in it yet stays hidden
// (no card, no menu entry, no page) and appears on its own once it has content.
import { cache } from "react";
import { publishedBusinesses } from "@/lib/business-booking";
import { ehrProducts, products } from "@/lib/platform";

// Read once per request, however many parts of the page ask.
export const platformVisibility = cache(async () => {
  const providers = await publishedBusinesses().catch(() => []);
  const ehr = ehrProducts().filter((p) => p.href);
  return { find: providers.length > 0, ehr: ehr.length > 0, ehrProducts: ehr, providers };
});

// Product cards, without the sections that are still empty.
export async function visibleProducts() {
  const v = await platformVisibility();
  return products().filter((p) => (p.key === "services" ? v.find : p.key === "ehr" ? v.ehr : true));
}

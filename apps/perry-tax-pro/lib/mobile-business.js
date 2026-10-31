import "server-only";
import { loadGrowth } from "@/lib/business-growth";
import { getPayout } from "@/lib/connect";
import { getEntitlement } from "@/lib/entitlements";
import { growthFacts, growthLevels } from "@/lib/growth-levels";
import { listPortfolio } from "@/lib/portfolio";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";

// Everything the Marketing and Profile tabs show, in one pass.
export async function loadBusinessHome(session) {
  const [g, portfolio, payout, plan] = await Promise.all([
    loadGrowth(session),
    listPortfolio(session.uid, session.idToken),
    getPayout(session.uid),
    getEntitlement(session.uid),
  ]);
  const ratings = g.feedback.map((f) => f.rating).filter(Number.isFinite);
  const facts = growthFacts({ ...g, portfolio, payout });
  const publicUrl = g.profile?.slug ? new URL(`/business/${g.profile.slug}`, SITE).toString() : null;
  return {
    ...g,
    portfolio,
    payout,
    plan,
    publicUrl,
    published: g.profile?.status === "PUBLISHED",
    rating: ratings.length ? Math.round((ratings.reduce((a, r) => a + r, 0) / ratings.length) * 10) / 10 : null,
    reviewCount: ratings.length,
    growth: growthLevels(facts),
    site: SITE,
  };
}

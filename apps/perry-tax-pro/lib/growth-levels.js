// Growth levels for the mobile Profile tab: four levels of concrete steps, each worked
// out from the business's own data, with a link to the screen that completes it. Pure,
// so it is unit-tested and shared by the server and the screens.
export const LEVELS = [
  {
    key: "STARTER", title: "Starter", pitch: "Get set up: the basics clients need to find and book you.",
    steps: [
      ["details", "Add your business name, phone and address", "/portal/business/profile"],
      ["service", "Add at least one service with a price", "/portal/business/workspace"],
      ["hours", "Set your opening hours", "/portal/business/profile"],
      ["published", "Publish your page so clients can book online", "/portal/business/profile"],
    ],
  },
  {
    key: "RISING", title: "Rising", pitch: "Look the part: photos and a client list build trust.",
    steps: [
      ["logo", "Add your logo or profile photo", "/m/business/profile"],
      ["cover", "Add a cover photo of your place", "/m/business/profile"],
      ["portfolio", "Add at least 3 photos of your work", "/m/business/profile#portfolio"],
      ["clients", "Add 5 clients", "/m/business/clients"],
    ],
  },
  {
    key: "ESTABLISHED", title: "Established", pitch: "Get paid and remembered: payments, reminders and reviews.",
    steps: [
      ["payments", "Connect your payment account to take cards", "/portal/business/plan"],
      ["completed", "Complete 5 appointments", "/m/business/appointments"],
      ["reminder", "Send a booking reminder", "/m/business/appointments"],
      ["reviews", "Collect 3 client reviews", "/portal/business/growth"],
    ],
  },
  {
    key: "PRO", title: "Pro", pitch: "Grow on autopilot: campaigns, a team and a strong reputation.",
    steps: [
      ["campaign", "Send an email campaign to your clients", "/portal/business/growth"],
      ["team", "Add a team member", "/portal/business/team"],
      ["regulars", "Have 5 regular clients", "/m/business/clients"],
      ["rating", "Keep 10 reviews with a 4.5★ average or better", "/portal/business/growth"],
    ],
  },
];

export function growthFacts({ profile, services = [], customers = [], bookings = [], feedback = [], campaigns = [], staff = [], portfolio = [], payout = null }) {
  const ratings = feedback.map((f) => f.rating).filter((r) => Number.isFinite(r));
  const average = ratings.length ? ratings.reduce((a, r) => a + r, 0) / ratings.length : 0;
  const weekly = profile?.booking?.weekly || {};
  return {
    details: Boolean(profile?.name && profile?.phone && (profile?.address || profile?.city)),
    service: services.some((s) => s.active !== false && s.priceCents > 0),
    hours: Object.values(weekly).some((w) => Array.isArray(w) && w.length > 0),
    published: profile?.status === "PUBLISHED",
    logo: Boolean(profile?.logoPath),
    cover: Boolean(profile?.coverPath),
    portfolio: portfolio.length >= 3,
    clients: customers.filter((c) => c.source !== "walk-in").length >= 5,
    payments: Boolean(payout?.chargesEnabled),
    completed: bookings.filter((b) => b.status === "COMPLETED").length >= 5,
    reminder: bookings.some((b) => b.reminder_sent_at),
    reviews: ratings.length >= 3,
    campaign: campaigns.some((c) => c.status === "SENT"),
    team: staff.some((s) => s.active),
    regulars: customers.filter((c) => c.stage === "VIP").length >= 5,
    rating: ratings.length >= 10 && average >= 4.5,
  };
}

// Each level with its steps marked done; the current level is the first unfinished one,
// and a level unlocks once the one before it is complete.
export function growthLevels(facts) {
  let previousDone = true;
  const levels = LEVELS.map((level) => {
    const steps = level.steps.map(([key, label, href]) => ({ key, label, href, done: Boolean(facts[key]) }));
    const doneCount = steps.filter((s) => s.done).length;
    const out = { key: level.key, title: level.title, pitch: level.pitch, steps, doneCount, total: steps.length, complete: doneCount === steps.length, locked: !previousDone };
    previousDone = previousDone && out.complete;
    return out;
  });
  const current = levels.find((l) => !l.complete) || levels.at(-1);
  return { levels, current };
}

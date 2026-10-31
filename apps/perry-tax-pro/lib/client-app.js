// Client app helpers with no server imports, shared by the screens, the server code and tests.

export const OPEN_STATUSES = ["REQUESTED", "CONFIRMED"];

export const BOOKING_STATUS_LABEL = {
  REQUESTED: "Waiting for confirmation",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "Missed",
  UNKNOWN: "Unavailable",
};

// Upcoming: still open and not over yet, soonest first. Everything else is past, newest first.
export function splitBookings(rows, nowMs) {
  const isUpcoming = (b) => OPEN_STATUSES.includes(b.status) && b.startMs + (b.minutes || 0) * 60_000 > nowMs;
  return {
    upcoming: rows.filter(isUpcoming).sort((a, b) => a.startMs - b.startMs),
    past: rows.filter((b) => !isUpcoming(b)).sort((a, b) => b.startMs - a.startMs),
  };
}

// The private "My bookings" row saved after a signed-in client books (see firestore rules).
export function clientBookingRecord(ownerUid, booked, nowIso) {
  return {
    tenantId: "perry-tax-pro",
    ownerUid,
    bookingId: booked.id,
    businessId: booked.business.id,
    slug: booked.business.slug,
    businessName: String(booked.business.name || "").slice(0, 120),
    serviceName: String(booked.serviceName || "").slice(0, 120),
    startMs: Math.trunc(booked.startMs),
    link: booked.token,
    createdAt: nowIso,
  };
}

export function searchBusinesses(businesses, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return businesses;
  return businesses.filter((b) => {
    const text = `${b.name} ${b.tagline || ""} ${b.city || ""} ${b.state || ""} ${(b.services || []).join(" ")}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

export function averageRating(reviews) {
  if (!reviews?.length) return null;
  return Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10;
}

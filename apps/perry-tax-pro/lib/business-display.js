// Presentation helpers shared by public business pages and the owner's screens.

export const WEEK = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];

const clock = (time) => {
  const [h, m] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export function weeklySummary(weekly = {}) {
  return WEEK.map(([day, label]) => {
    const windows = weekly[day] || weekly[String(day)] || [];
    return { day, label, text: windows.length ? windows.map((w) => `${clock(w.start)} – ${clock(w.end)}`).join(", ") : "Closed" };
  });
}

export const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);

export const mediaUrl = (path) => (path ? `/api/public/media/${path}` : null);

export function addressLine(profile) {
  return [profile.address, [profile.city, [profile.state, profile.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");
}

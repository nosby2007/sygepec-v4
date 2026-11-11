// Shared by the support screens: one way to call the API and read its errors.
export async function send(url, method, body) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).catch(() => null);
  const data = await res?.json().catch(() => ({}));
  if (!res) return { error: "No connection. Please try again." };
  if (!res.ok) return { error: data?.error || "That did not work. Please try again.", code: data?.code, status: res.status };
  return { data };
}

// Sent with each new item, so a retried request cannot create it twice.
export const newKey = () => crypto.randomUUID();

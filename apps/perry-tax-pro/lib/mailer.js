import "server-only";

// Optional transactional/marketing email through Resend's HTTP API. Off unless both
// RESEND_API_KEY and MAIL_FROM (a verified sender, e.g. "InnovaCare <contact@innovacarereview.com>")
// are set in the server environment. Without them, owners copy messages and send them themselves.
export function mailerConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

// Display name for a message: the business's own name "via" the platform, always on the
// verified sending address, so replies can go to the business (reply_to) without spoofing it.
export function fromHeader(fromName, mailFrom = process.env.MAIL_FROM) {
  const match = /<([^>]+)>/.exec(mailFrom || "");
  const address = match ? match[1] : String(mailFrom || "").trim();
  const platform = match ? mailFrom.slice(0, match.index).trim().replace(/^"|"$/g, "") : "";
  if (!fromName) return mailFrom;
  const name = `${fromName}${platform ? ` via ${platform}` : ""}`.replace(/["<>\r\n]/g, "").slice(0, 120);
  return `"${name}" <${address}>`;
}

export async function sendEmail({ to, subject, text, unsubscribeUrl, oneClickUrl, replyTo, fromName }, fetcher = fetch) {
  if (!mailerConfigured()) throw new Error("Email sending is not configured");
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromHeader(fromName),
      to: [to],
      subject: String(subject).replace(/[\r\n]+/g, " ").slice(0, 200),
      text: unsubscribeUrl ? `${text}\n\n—\nUnsubscribe: ${unsubscribeUrl}` : text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(oneClickUrl ? { headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Email provider refused the message (${response.status})`);
  return true;
}

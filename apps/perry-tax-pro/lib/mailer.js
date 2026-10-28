import "server-only";

// Optional transactional/marketing email through Resend's HTTP API. Off unless both
// RESEND_API_KEY and MAIL_FROM (a verified sender, e.g. "Acme <hello@acme.com>") are set
// in the server environment. Without them, owners copy messages and send them themselves.
export function mailerConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendEmail({ to, subject, text, unsubscribeUrl, oneClickUrl, replyTo }, fetcher = fetch) {
  if (!mailerConfigured()) throw new Error("Email sending is not configured");
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [to],
      subject: String(subject).slice(0, 200),
      text: unsubscribeUrl ? `${text}\n\n—\nUnsubscribe: ${unsubscribeUrl}` : text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(oneClickUrl ? { headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Email provider refused the message (${response.status})`);
  return true;
}

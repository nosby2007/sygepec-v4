import "server-only";
import { mailerConfigured, sendEmail } from "@/lib/mailer";
import { sendSms, toE164, twilioSmsConfigured } from "@/lib/twilio";

// Messages the app sends to clients on its own. Every message points to the portal
// rather than carrying tax details, since email and text are not private channels.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://perry-tax-pro-sygepec-v4.web.app";
const FROM = "InnovaCare Tax";
const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

const TAX_STAGES = {
  IN_REVIEW: ["Your return is being prepared", "Your preparer has started working on your return. We will let you know if anything else is needed."],
  READY_TO_SIGN: ["Your return is ready to review and sign", "Your return is ready. Please log in to review it and sign Form 8879 so we can e-file."],
  FILED: ["Your return was e-filed", "Your return has been sent to the IRS. We will let you know when it is accepted, usually within 48 hours."],
  ACCEPTED: ["The IRS accepted your return", "Good news: the IRS accepted your return. You can download your copies from your portal."],
};

const BUSINESS_STAGES = {
  AWAITING_SIGNATURE: ["Your business return is ready to sign", "Your business return is ready. Please log in to review it; your preparer will send the signature form."],
  TRANSMITTED: ["Your business return was e-filed", "Your business return has been sent to the IRS. We will let you know when it is accepted."],
  ACCEPTED: ["The IRS accepted your business return", "The IRS accepted your business return. Copies are in your workspace."],
  REJECTED: ["Your business return needs attention", "The IRS sent your business return back. Your preparer is reviewing it and will contact you."],
};

export async function emailClient({ to, name, subject, text, link = "/portal" }) {
  if (!mailerConfigured() || !to) return false;
  await sendEmail({ to, subject, fromName: FROM, text: `Hi ${first(name)},\n\n${text}\n\nLog in: ${SITE}${link}\n\nInnovaCare Tax` });
  return true;
}

export async function textClient({ to, text }) {
  const number = toE164(to);
  if (!twilioSmsConfigured() || !number) return false;
  await sendSms({ to: number, body: `InnovaCare Tax: ${text} Reply STOP to opt out.` });
  return true;
}

// r is the return as the screens see it (lib/data returnDto).
export async function notifyStatusChange(r, status) {
  const stage = TAX_STAGES[status];
  if (!stage) return false;
  return emailClient({ to: r.client_email, name: r.client_name, subject: stage[0], text: stage[1] });
}

export async function notifyBusinessReturn(record, status) {
  const stage = BUSINESS_STAGES[status];
  if (!stage || !record?.user?.email) return false;
  return emailClient({ to: record.user.email, name: record.user.name, subject: stage[0], text: stage[1], link: "/portal/business" });
}

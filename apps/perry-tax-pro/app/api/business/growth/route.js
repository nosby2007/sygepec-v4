import { ownerRoute, readJson } from "@/lib/business-api";
import {
  addCustomerNote, customerFromBooking, listCustomerNotes, requestFeedback, saveCampaign, saveCustomer, sendCampaign, sendReminder, updateFeedback,
} from "@/lib/business-growth";
import { BusinessError } from "@/lib/business-booking";

const ACTIONS = {
  saveCustomer: (s, b) => saveCustomer(s, b.id || null, b.customer || {}),
  addNote: (s, b) => addCustomerNote(s, b.customerId, b),
  customerFromBooking: (s, b) => customerFromBooking(s, b.bookingId),
  sendReminder: (s, b) => sendReminder(s, b.bookingId, ["EMAIL", "SMS"].includes(b.channel) ? b.channel : "MANUAL"),
  requestFeedback: (s, b) => requestFeedback(s, b.bookingId),
  updateFeedback: (s, b) => updateFeedback(s, b.id, b),
  saveCampaign: (s, b) => saveCampaign(s, b.id || null, b.campaign || {}),
  sendCampaign: (s, b) => sendCampaign(s, b.id, b.mode === "EMAIL" ? "EMAIL" : "MANUAL"),
};

// GET ?notes=<customerId> lists a customer's timeline.
export const GET = (req) => ownerRoute(req, async (session) => ({ notes: await listCustomerNotes(session, new URL(req.url).searchParams.get("notes")) }));

// POST { action, ...input }
export const POST = (req) => ownerRoute(req, async (session) => {
  const body = await readJson(req);
  const run = ACTIONS[body.action];
  if (!run) throw new BusinessError("Unsupported action.");
  return { ok: true, result: (await run(session, body)) ?? null };
});

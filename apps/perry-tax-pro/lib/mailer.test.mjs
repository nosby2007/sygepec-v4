import { test } from "node:test";
import assert from "node:assert/strict";
import { fromHeader, sendEmail } from "./mailer.js";

test("the business name shows as sender on the verified address", () => {
  const from = "InnovaCare <contact@innovacarereview.com>";
  assert.equal(fromHeader("Maple Studio", from), '"Maple Studio via InnovaCare" <contact@innovacarereview.com>');
  assert.equal(fromHeader('Evil" <x@y.z>\r\nBcc: a', from), '"Evil x@y.zBcc: a via InnovaCare" <contact@innovacarereview.com>');
  assert.equal(fromHeader("", from), from);
  assert.equal(fromHeader("Solo", "contact@innovacarereview.com"), '"Solo" <contact@innovacarereview.com>');
});

test("messages carry reply-to, unsubscribe and no header injection", async () => {
  Object.assign(process.env, { RESEND_API_KEY: "test-key", MAIL_FROM: "InnovaCare <contact@innovacarereview.com>" });
  let sent;
  await sendEmail({ to: "a@example.test", subject: "Hi\r\nBcc: x", text: "Body", unsubscribeUrl: "https://u", oneClickUrl: "https://o", replyTo: "shop@example.test", fromName: "Maple" },
    async (url, init) => { sent = { url, init }; return new Response("{}", { status: 200 }); });
  const body = JSON.parse(sent.init.body);
  assert.equal(sent.url, "https://api.resend.com/emails");
  assert.equal(sent.init.headers.Authorization, "Bearer test-key");
  assert.equal(body.subject, "Hi Bcc: x");
  assert.equal(body.reply_to, "shop@example.test");
  assert.match(body.text, /Unsubscribe: https:\/\/u$/);
  assert.equal(body.headers["List-Unsubscribe"], "<https://o>");
  await assert.rejects(sendEmail({ to: "a@example.test", subject: "s", text: "t" }, async () => new Response("{}", { status: 422 })), /refused/);
});

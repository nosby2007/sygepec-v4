// Run through `npm test`, which maps the "server-only" import (see test/node-hooks.mjs).
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { decodeProtectedHeader, jwtVerify } from "jose";
import { ensureVideoRoom, sendSms, toE164, twilioSmsConfigured, twilioVideoConfigured, videoAccessToken } from "./twilio.js";

const ENV = { TWILIO_ACCOUNT_SID: "ACtest", TWILIO_API_KEY_SID: "SKtest", TWILIO_API_KEY_SECRET: "keysecret" };
const KEYS = [...Object.keys(ENV), "TWILIO_MESSAGING_SERVICE_SID", "TWILIO_FROM_NUMBER"];
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
});

test("video and SMS stay off until their credentials are present", () => {
  assert.equal(twilioVideoConfigured(), false);
  Object.assign(process.env, ENV);
  assert.equal(twilioVideoConfigured(), true);
  assert.equal(twilioSmsConfigured(), false);
  process.env.TWILIO_FROM_NUMBER = "+15550100000";
  assert.equal(twilioSmsConfigured(), true);
});

test("phone numbers become E.164 or are refused", () => {
  assert.equal(toE164("(555) 010-2000"), "+15550102000");
  assert.equal(toE164("1 555 010 2000"), "+15550102000");
  assert.equal(toE164("+44 20 7946 0000"), "+442079460000");
  assert.equal(toE164("010-2000"), null);
  assert.equal(toE164(""), null);
});

test("access token is limited to one identity and one room", async () => {
  Object.assign(process.env, ENV);
  const token = await videoAccessToken({ identity: "Ana|uid1", room: "tax-abc", ttlSeconds: 600 });
  assert.equal(decodeProtectedHeader(token).cty, "twilio-fpa;v=1");
  const { payload } = await jwtVerify(token, new TextEncoder().encode("keysecret"));
  assert.equal(payload.iss, "SKtest");
  assert.equal(payload.sub, "ACtest");
  assert.deepEqual(payload.grants, { identity: "Ana|uid1", video: { room: "tax-abc" } });
  assert.ok(payload.exp - payload.iat <= 600);
});

test("an already open room is reused", async () => {
  Object.assign(process.env, ENV);
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return json(400, { code: 53113 }); };
  assert.equal(await ensureVideoRoom("tax-abc", fetcher), true);
  assert.equal(calls[0].init.body.get("RecordParticipantsOnConnect"), "false");
  await assert.rejects(ensureVideoRoom("tax-abc", async () => json(401, { code: 20003 })));
});

test("sends a text through the messaging service when one is set", async () => {
  Object.assign(process.env, ENV, { TWILIO_MESSAGING_SERVICE_SID: "MGtest", TWILIO_FROM_NUMBER: "+15550100000" });
  let sent;
  const fetcher = async (url, init) => { sent = { url, init }; return json(201, { sid: "SM1" }); };
  const result = await sendSms({ to: "555-010-2000", body: "Hello" }, fetcher);
  assert.deepEqual(result, { sid: "SM1", to: "+15550102000" });
  assert.ok(sent.url.endsWith("/Accounts/ACtest/Messages.json"));
  assert.equal(sent.init.body.get("MessagingServiceSid"), "MGtest");
  assert.equal(sent.init.body.get("From"), null);
  assert.equal(sent.init.headers.Authorization, `Basic ${Buffer.from("SKtest:keysecret").toString("base64")}`);
  await assert.rejects(sendSms({ to: "555-010-2000", body: "x" }, async () => json(400, {})), /refused/);
});

test("a trailing newline on a secret is ignored", async () => {
  Object.assign(process.env, ENV, { TWILIO_API_KEY_SECRET: "keysecret\n" });
  let auth;
  await ensureVideoRoom("tax-abc", async (_url, init) => { auth = init.headers.Authorization; return json(201, {}); });
  assert.equal(auth, `Basic ${Buffer.from("SKtest:keysecret").toString("base64")}`);
});

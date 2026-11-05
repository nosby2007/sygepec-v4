import crypto from "node:crypto";

// Full direct-deposit numbers: checks and encryption. Pure, so it is unit-tested.
// The key (BANK_DETAILS_KEY, base64 of 32 bytes) lives only in Secret Manager. It is not
// derived from SESSION_SECRET, so rotating sessions never touches these records.
export const ACCOUNT_TYPES = ["CHECKING", "SAVINGS"];

// The ABA check digit catches most typing mistakes in a routing number.
export function validRouting(value) {
  if (!/^\d{9}$/.test(value) || /^0{9}$/.test(value)) return false;
  const d = [...value].map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}

// The IRS allows up to 17 characters; these forms take digits only.
export const validAccount = (value) => /^\d{4,17}$/.test(value);

// Returns { routing, account, accountType } or { error }. Never echoes a number in an error.
export function checkBankInput(input) {
  const digits = (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : "");
  const routing = digits(input?.routing);
  const account = digits(input?.account);
  if (!validRouting(routing)) return { error: "Check the routing number. It should be 9 digits." };
  if (!validAccount(account)) return { error: "Check the account number. It should be 4 to 17 digits." };
  if (account !== digits(input?.confirmAccount)) return { error: "The account numbers do not match." };
  if (!ACCOUNT_TYPES.includes(input?.accountType)) return { error: "Choose checking or savings." };
  return { routing, account, accountType: input.accountType };
}

export function bankKey(encoded) {
  if (typeof encoded !== "string") return null;
  const key = Buffer.from(encoded.trim(), "base64");
  return key.length === 32 ? key : null;
}

// boundTo ties the record to one return, so a sealed value copied onto another return fails.
export function sealBank({ routing, account }, boundTo, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(boundTo, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify({ routing, account }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function unsealBank(sealed, boundTo, key) {
  const raw = Buffer.from(String(sealed || ""), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(boundTo, "utf8"));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
}

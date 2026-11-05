import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { bankKey, checkBankInput, sealBank, unsealBank, validAccount, validRouting } from "./bank-rules.js";

const key = crypto.randomBytes(32);
const good = { routing: "111000025", account: "000123456789", confirmAccount: "000123456789", accountType: "CHECKING" };

test("routing numbers need 9 digits and a correct check digit", () => {
  assert.equal(validRouting("111000025"), true);
  assert.equal(validRouting("111000026"), false);
  assert.equal(validRouting("000000000"), false);
  assert.equal(validRouting("11100002"), false);
  assert.equal(validRouting("11100002a"), false);
});

test("account numbers are 4 to 17 digits", () => {
  assert.equal(validAccount("1234"), true);
  assert.equal(validAccount("12345678901234567"), true);
  assert.equal(validAccount("123"), false);
  assert.equal(validAccount("123456789012345678"), false);
  assert.equal(validAccount("12a4"), false);
});

test("input checks tidy spaces and never repeat a number in an error", () => {
  assert.deepEqual(checkBankInput({ ...good, routing: "111 000 025", account: "0001-2345-6789" }), { routing: "111000025", account: "000123456789", accountType: "CHECKING" });
  for (const bad of [{ ...good, routing: "111000026" }, { ...good, account: "12" }, { ...good, confirmAccount: "999999" }, { ...good, accountType: "OTHER" }, {}, null]) {
    const result = checkBankInput(bad);
    assert.ok(result.error);
    assert.ok(!/\d{4,}/.test(result.error));
  }
});

test("sealed numbers open only with the same key and the same return", () => {
  const sealed = sealBank(good, "ret1", key);
  assert.ok(!sealed.includes(good.account));
  assert.ok(!Buffer.from(sealed, "base64").toString("latin1").includes(good.account));
  assert.deepEqual(unsealBank(sealed, "ret1", key), { routing: good.routing, account: good.account });
  assert.throws(() => unsealBank(sealed, "ret2", key));
  assert.throws(() => unsealBank(sealed, "ret1", crypto.randomBytes(32)));
  const raw = Buffer.from(sealed, "base64");
  raw[raw.length - 1] ^= 1;
  assert.throws(() => unsealBank(raw.toString("base64"), "ret1", key));
  assert.notEqual(sealBank(good, "ret1", key), sealed);
});

test("the key must be exactly 32 bytes", () => {
  assert.equal(bankKey(undefined), null);
  assert.equal(bankKey(""), null);
  assert.equal(bankKey(crypto.randomBytes(16).toString("base64")), null);
  assert.ok(bankKey(key.toString("base64")));
});

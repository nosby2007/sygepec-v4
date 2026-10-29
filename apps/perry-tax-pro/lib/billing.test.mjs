// Run through `npm test`, which maps the "server-only" import (see test/node-hooks.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFee, paymentBlock, paymentDue } from "./billing.js";
import { formEncode } from "./stripe.js";

const fee = (timing, status = "UNPAID") => ({ amountCents: 14_900, timing, status });

test("pay before signing blocks both signing and e-file", () => {
  assert.match(paymentBlock(fee("BEFORE_SIGNATURE"), "SIGN"), /\$149 fee must be paid before the signature/);
  assert.match(paymentBlock(fee("BEFORE_SIGNATURE"), "FILE"), /before the return is e-filed/);
});

test("pay before filing lets the client sign first", () => {
  assert.equal(paymentBlock(fee("BEFORE_FILING"), "SIGN"), null);
  assert.ok(paymentBlock(fee("BEFORE_FILING"), "FILE"));
});

test("pay after filing, a settled fee or no fee never blocks", () => {
  assert.equal(paymentBlock(fee("AFTER_FILING"), "FILE"), null);
  for (const status of ["PAID", "WAIVED", "REFUND_TRANSFER"]) assert.equal(paymentBlock(fee("BEFORE_SIGNATURE", status), "SIGN"), null);
  assert.equal(paymentBlock(null, "SIGN"), null);
});

test("the client is asked to pay after filing only once the return is filed", () => {
  assert.equal(paymentDue(fee("AFTER_FILING"), "IN_REVIEW"), false);
  assert.equal(paymentDue(fee("AFTER_FILING"), "FILED"), true);
  assert.equal(paymentDue(fee("BEFORE_SIGNATURE"), "IN_REVIEW"), true);
  assert.equal(paymentDue(fee("BEFORE_SIGNATURE", "PAID"), "IN_REVIEW"), false);
});

test("fees are parsed to cents and bounded", () => {
  assert.deepEqual(parseFee({ amount: "249.99", timing: "BEFORE_FILING" }), { amountCents: 24_999, timing: "BEFORE_FILING" });
  assert.equal(parseFee({ amount: "250", timing: "nope" }).timing, "BEFORE_SIGNATURE");
  assert.ok(parseFee({ amount: "0.5" }).error);
  assert.ok(parseFee({ amount: "abc" }).error);
});

test("Stripe form encoding uses bracketed keys for nested data", () => {
  const body = formEncode({ mode: "payment", line_items: [{ quantity: 1, price_data: { unit_amount: 100 } }], skip: null });
  assert.equal(body.get("line_items[0][price_data][unit_amount]"), "100");
  assert.equal(body.get("mode"), "payment");
  assert.equal(body.has("skip"), false);
});

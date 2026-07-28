import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  formSignature,
  handlerError,
  handlerSignature,
  handlerSuccess,
  parseHandlerRequest,
  paymentUrl,
  signaturesMatch,
} from "../lib/payments/unitpay.ts";

const SECRET = "test-secret-key";

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

test("подпись формы: account{up}desc{up}sum{up}secretKey", () => {
  const signature = formSignature({ account: "42", desc: "Подписка", sum: "199.00" }, SECRET);
  assert.equal(signature, sha256(["42", "Подписка", "199.00", SECRET].join("{up}")));
});

test("подпись формы с валютой: currency встаёт вторым (алфавитный порядок)", () => {
  const signature = formSignature(
    { account: "42", desc: "Подписка", sum: "199.00", currency: "RUB" },
    SECRET,
  );
  assert.equal(signature, sha256(["42", "RUB", "Подписка", "199.00", SECRET].join("{up}")));
});

test("подпись обработчика: method + значения по алфавиту + secretKey", () => {
  const params = { account: "42", sum: "199.00", unitpayId: "123456" };
  // Алфавит: account, sum, unitpayId
  assert.equal(
    handlerSignature("pay", params, SECRET),
    sha256(["pay", "42", "199.00", "123456", SECRET].join("{up}")),
  );
});

test("подпись обработчика игнорирует поля sign и signature", () => {
  const base = { account: "42", sum: "199.00", unitpayId: "123456" };
  const withNoise = { ...base, signature: "старая", sign: "тоже" };
  assert.equal(handlerSignature("pay", withNoise, SECRET), handlerSignature("pay", base, SECRET));
});

function buildQuery(method, params, secret = SECRET) {
  const signature = handlerSignature(method, params, secret);
  const search = new URLSearchParams({ method });
  for (const [key, value] of Object.entries(params)) search.set(`params[${key}]`, value);
  search.set("params[signature]", signature);
  return search;
}

const VALID = { account: "42", sum: "199.00", unitpayId: "123456", date: "2026-07-28 10:00:00" };

test("корректно подписанный запрос разбирается", () => {
  const result = parseHandlerRequest(buildQuery("pay", VALID), SECRET);
  assert.equal(result.ok, true);
  assert.equal(result.request.method, "pay");
  assert.equal(result.request.unitpayId, "123456");
  assert.equal(result.request.account, "42");
});

test("подделка суммы ломает подпись", () => {
  const query = buildQuery("pay", VALID);
  query.set("params[sum]", "1.00");
  const result = parseHandlerRequest(query, SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "bad_signature");
});

test("подпись чужим ключом отклоняется", () => {
  const result = parseHandlerRequest(buildQuery("pay", VALID, "another-secret"), SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "bad_signature");
});

test("неизвестный метод отклоняется", () => {
  const result = parseHandlerRequest(buildQuery("refund", VALID), SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "bad_method");
});

test("запрос без обязательных полей отклоняется", () => {
  const result = parseHandlerRequest(buildQuery("pay", { account: "42" }), SECRET);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "bad_params");
});

test("поддерживаются все три метода", () => {
  for (const method of ["check", "pay", "error"]) {
    assert.equal(parseHandlerRequest(buildQuery(method, VALID), SECRET).ok, true, method);
  }
});

test("сравнение подписей устойчиво к разной длине", () => {
  assert.equal(signaturesMatch("abc", "abc"), true);
  assert.equal(signaturesMatch("abc", "abcd"), false);
  assert.equal(signaturesMatch("abc", ""), false);
});

test("ответы обработчика в формате JSON-RPC", () => {
  assert.deepEqual(handlerSuccess("ок"), { jsonrpc: "2.0", result: { message: "ок" }, id: 1 });
  assert.deepEqual(handlerError("нет"), { jsonrpc: "2.0", error: { code: -32000, message: "нет" }, id: 1 });
});

test("ссылка на оплату содержит ключ, сумму и корректную подпись", () => {
  const link = paymentUrl({
    publicKey: "public-key",
    secretKey: SECRET,
    account: "42",
    sum: "199.00",
    desc: "Подписка",
  });
  const url = new URL(link);
  assert.equal(url.pathname, "/pay/public-key");
  assert.equal(url.searchParams.get("sum"), "199.00");
  assert.equal(
    url.searchParams.get("signature"),
    formSignature({ account: "42", sum: "199.00", desc: "Подписка" }, SECRET),
  );
});

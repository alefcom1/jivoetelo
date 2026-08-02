import test from "node:test";
import assert from "node:assert/strict";
import { describeAiFailure, networkDetail } from "../lib/ai/failure.ts";

/** Ошибка с причиной — так их строят и undici, и SDK Anthropic. */
function withCause(message, cause, extra = {}) {
  return Object.assign(new Error(message, { cause }), extra);
}

test("причина берётся с самого дна цепочки, а не с первого уровня", () => {
  // Ровно то, что пришло из боя: три уровня, и полезен только нижний.
  // SDK: «Connection error.» → undici: «fetch failed» → DNS: ENOTFOUND.
  const dns = withCause("getaddrinfo ENOTFOUND proxy.techperevod.com", undefined, { code: "ENOTFOUND" });
  const fetchFailed = withCause("fetch failed", dns);
  const sdk = withCause("Connection error.", fetchFailed, { name: "APIConnectionError" });

  const failure = describeAiFailure(sdk);
  assert.equal(failure.kind, "network");
  assert.match(failure.message, /ENOTFOUND/);
  assert.match(failure.message, /proxy\.techperevod\.com/);
  assert.ok(
    !/^Connection error\. \(fetch failed\)$/.test(failure.message),
    `в логе снова бесполезное «fetch failed»: ${failure.message}`,
  );
});

test("код ошибки не дублируется, если он уже есть в тексте", () => {
  const dns = withCause("getaddrinfo ENOTFOUND proxy.techperevod.com", undefined, { code: "ENOTFOUND" });
  const sdk = withCause("Connection error.", withCause("fetch failed", dns), { name: "APIConnectionError" });
  assert.equal(describeAiFailure(sdk).message.match(/ENOTFOUND/g).length, 1);
});

test("код добавляется, когда в тексте его нет", () => {
  const refused = withCause("connect ECONNREFUSED 10.0.0.5:443", undefined, { code: "ECONNREFUSED" });
  const cert = withCause("unable to verify the first certificate", refused, { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });
  const sdk = withCause("Connection error.", cert, { name: "APIConnectionError" });
  // Самый глубокий — ECONNREFUSED, и код в его тексте уже есть.
  assert.match(describeAiFailure(sdk).message, /ECONNREFUSED/);
});

test("замкнутая цепочка причин не вешает процесс", () => {
  const a = new Error("первая");
  const b = withCause("вторая", a);
  a.cause = b; // цикл
  const sdk = withCause("Connection error.", a, { name: "APIConnectionError" });
  const failure = describeAiFailure(sdk); // не должно зациклиться
  assert.equal(failure.kind, "network");
});

test("без вложенных причин строка не обрастает пустыми скобками", () => {
  const bare = Object.assign(new Error("Connection error."), { name: "APIConnectionError" });
  assert.equal(networkDetail(bare), "");
  assert.equal(describeAiFailure(bare).message, "Connection error.");
});

test("таймаут и отказ сервера разбираются по-прежнему", () => {
  const timeout = Object.assign(new Error("Request timed out."), { name: "TimeoutError" });
  assert.equal(describeAiFailure(timeout).kind, "timeout");

  const http = Object.assign(new Error("400 Bad Request"), {
    status: 400,
    error: { error: { message: "This model does not support the effort parameter" } },
  });
  const failure = describeAiFailure(http);
  assert.equal(failure.kind, "http");
  assert.equal(failure.status, 400);
  assert.match(failure.message, /effort parameter/);
});

test("нестандартное значение в cause не ломает разбор", () => {
  const sdk = withCause("Connection error.", "просто строка", { name: "APIConnectionError" });
  assert.equal(describeAiFailure(sdk).kind, "network");
});

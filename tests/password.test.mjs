import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../lib/password.ts";

test("пароль проходит проверку после хеширования", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.match(hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
});

test("неверный пароль и мусорный хеш отклоняются", async () => {
  const hash = await hashPassword("secret-password");
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(await verifyPassword("secret-password", "garbage"), false);
});

test("одинаковые пароли дают разные хеши (соль)", async () => {
  const a = await hashPassword("same");
  const b = await hashPassword("same");
  assert.notEqual(a, b);
});

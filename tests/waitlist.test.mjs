import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail } from "../lib/email.ts";

test("normalizeEmail принимает валидные адреса и приводит к каноническому виду", () => {
  assert.equal(normalizeEmail("user@example.com"), "user@example.com");
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
  assert.equal(normalizeEmail("ivan.petrov+tag@mail.ru"), "ivan.petrov+tag@mail.ru");
});

test("normalizeEmail отклоняет невалидные адреса", () => {
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail("   "), null);
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail("a b@example.com"), null);
  assert.equal(normalizeEmail("user@example.c"), null);
  assert.equal(normalizeEmail("a@b." + "c".repeat(260)), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("landing page carries the Живое Тело product experience", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /Живое Тело/);
  assert.match(page, /Создать мой ритм/);
  assert.match(page, /Для специалистов/);
  assert.match(layout, /lang="ru"/);
  assert.match(layout, /og\.png/);
  assert.match(css, /--coral/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("landing page carries the JIVELO premium product experience", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /JIVELO/);
  assert.match(page, /Не просто считайте/);
  assert.match(page, /Что съесть/);
  assert.match(page, /JIVELO Pro/);
  assert.match(layout, /lang="ru"/);
  assert.match(layout, /og\.png/);
  assert.match(css, /--primary/);
  assert.match(css, /--coral/);
});

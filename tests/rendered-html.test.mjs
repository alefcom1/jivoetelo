import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("landing page carries the JIVELO premium product experience", async () => {
  const [page, layout, css, refinement, artwork, sections] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/layout.tsx"),
    read("../app/globals.css"),
    read("../app/refinement.css"),
    read("../app/artwork.css"),
    read("../app/components/marketing-sections.tsx"),
  ]);

  assert.match(page, /JIVELO/);
  assert.match(page, /Не просто считайте/);
  assert.match(page, /Что съесть/);
  assert.match(page, /JIVELO Pro/);
  assert.match(layout, /lang="ru"/);
  assert.match(layout, /SiteHeader/);
  assert.match(layout, /Onest/);
  assert.match(layout, /Prata/);
  assert.match(layout, /refinement\.css/);
  assert.match(layout, /artwork\.css/);
  assert.match(css, /--primary/);
  assert.match(css, /--coral/);
  assert.match(refinement, /Correct food-photo semantics/);
  assert.match(artwork, /approved-artwork integration/);
  assert.match(artwork, /\.bento \.dark:after/);
  assert.match(artwork, /\.plans article:before/);
  assert.match(artwork, /\.final \.big-mark/);
  assert.match(artwork, /Premium aligned footer/);
  assert.match(sections, /page-cta-visual/);
  assert.match(sections, /AI-анализ готов/);
});

test("shared site chrome exposes a premium mega menu", async () => {
  const [chrome, marketing] = await Promise.all([
    read("../app/components/site-chrome.tsx"),
    read("../app/marketing.css"),
  ]);

  assert.match(chrome, /mega-menu-panel/);
  assert.match(chrome, /AI-камера/);
  assert.match(chrome, /Что съесть сейчас/);
  assert.match(chrome, /JIVELO Pro/);
  assert.match(chrome, /Методология/);
  assert.match(marketing, /\.mega-wrap/);
  assert.match(marketing, /\.mobile-navigation/);
});

test("core marketing routes have distinct product experiences", async () => {
  const [product, camera, eat, adaptive, pro, pricing, science, resources, readme] = await Promise.all([
    read("../app/product/page.tsx"),
    read("../app/ai-food-camera/page.tsx"),
    read("../app/what-to-eat/page.tsx"),
    read("../app/adaptive-plan/page.tsx"),
    read("../app/pro/page.tsx"),
    read("../app/pricing/page.tsx"),
    read("../app/science/page.tsx"),
    read("../app/[slug]/page.tsx"),
    read("../README.md"),
  ]);

  assert.match(product, /любой способ/);
  assert.match(camera, /JIVELO Vision/);
  assert.match(eat, /Почему подходит/);
  assert.match(adaptive, /Ваше тело уточняет план/);
  assert.match(pro, /Меньше таблиц/);
  assert.match(pricing, /Free действительно бесплатный/);
  assert.match(science, /Границы продукта/);
  assert.match(resources, /recipes/);
  assert.match(resources, /articles/);
  assert.match(resources, /security/);
  assert.match(resources, /privacy/);
  assert.match(resources, /terms/);
  assert.match(resources, /contact/);
  assert.match(resources, /login/);
  assert.match(resources, /register/);
  assert.match(readme, /\/ai-food-camera/);
  assert.match(readme, /\/security/);
  assert.match(readme, /keyboard navigation/);
});

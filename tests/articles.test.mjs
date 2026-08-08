import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { ARTICLES, FEATURED_SLUGS, featuredArticles, findArticle } from "../lib/articles.ts";

/**
 * Журнал. На реестр статей смотрят четыре места — хаб /blog, витрина на
 * главной, sitemap и «Читайте также», — и ошибка в нём не падает сборкой:
 * битый слаг просто превращается в 404 или пустую карточку. Проверяем то,
 * что разъезжается молча.
 */

test("у каждой статьи реестра есть текст в app/blog/content", () => {
  for (const article of ARTICLES) {
    const file = new URL(`../app/blog/content/${article.slug}.tsx`, import.meta.url);
    assert.ok(existsSync(file), `нет файла app/blog/content/${article.slug}.tsx`);
  }
});

test("диспетчер [slug] знает каждый слаг реестра", async () => {
  const source = await readFile(new URL("../app/blog/[slug]/page.tsx", import.meta.url), "utf8");
  for (const article of ARTICLES) {
    assert.ok(
      source.includes(`"${article.slug}":`),
      `в CONTENT нет «${article.slug}» — страница откроется как 404 при живом реестре`,
    );
  }
});

test("слаги уникальны и в формате адреса", () => {
  const slugs = ARTICLES.map((article) => article.slug);
  assert.equal(new Set(slugs).size, slugs.length, `повтор слага: ${slugs.join(", ")}`);
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9-]+$/, `«${slug}» — слаг должен быть латиницей с дефисами`);
  }
});

test("витрина главной — три существующие статьи", () => {
  assert.equal(FEATURED_SLUGS.length, 3, "на главной ровно три карточки");
  assert.equal(featuredArticles().length, 3, "какой-то из FEATURED_SLUGS не находится в реестре");
  for (const slug of FEATURED_SLUGS) {
    assert.ok(findArticle(slug), `«${slug}» нет в реестре`);
  }
});

test("описания влезают в выдачу, заголовки — в карточки", () => {
  for (const article of ARTICLES) {
    assert.ok(article.description.length >= 80, `«${article.slug}»: описание короче 80 символов`);
    assert.ok(article.description.length <= 180, `«${article.slug}»: описание длиннее 180 символов`);
    assert.ok(article.title.length <= 75, `«${article.slug}»: заголовок длиннее 75 символов`);
    assert.ok(article.titleShort.length <= 40, `«${article.slug}»: короткое имя длиннее 40 символов`);
    assert.match(article.published, /^\d{4}-\d{2}-\d{2}$/, `«${article.slug}»: дата не ГГГГ-ММ-ДД`);
    assert.ok(article.minutes >= 3 && article.minutes <= 20, `«${article.slug}»: странное время чтения`);
  }
});

test("скриншоты, на которые ссылаются статьи, существуют", async () => {
  for (const article of ARTICLES) {
    const source = await readFile(
      new URL(`../app/blog/content/${article.slug}.tsx`, import.meta.url),
      "utf8",
    );
    for (const [, src] of source.matchAll(/src="(\/blog\/[^"]+)"/g)) {
      assert.ok(
        existsSync(new URL(`../public${src}`, import.meta.url)),
        `«${article.slug}» ссылается на ${src}, а файла нет — соберите: node scripts/blog-shots.mjs`,
      );
    }
  }
});

test("заявленная растровая обложка существует", () => {
  for (const article of ARTICLES) {
    if (!article.heroImage) continue;
    assert.ok(
      existsSync(new URL(`../public${article.heroImage}`, import.meta.url)),
      `«${article.slug}»: heroImage ${article.heroImage} не найден в public/`,
    );
  }
});

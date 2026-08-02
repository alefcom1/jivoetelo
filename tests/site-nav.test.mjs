import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { hasLinks, NAV_EXEMPT, NAV_SECTIONS } from "../lib/site-nav.ts";

/**
 * Главное меню (lib/site-nav.ts, app/site-header.tsx).
 *
 * Все три ошибки, из-за которых этот тест появился, глазами не видны, если
 * не знать, куда смотреть: «Продукт» и «Решения» открывали одну панель с
 * обоими списками, «О нас» вело на якорь, которого на главной нет, а ссылки
 * внутри панелей никто не сверял с настоящими маршрутами. Проверяем всё
 * три, потому что каждая из них — «меню как будто работает».
 */

const landing = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

/** Есть ли такая страница в приложении: `/raschet/plan` → app/raschet/plan/page.tsx */
function routeExists(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  const base = new URL(`../app/${clean ? `${clean}/` : ""}`, import.meta.url);
  return ["page.tsx", "page.ts", "page.jsx"].some((file) => existsSync(new URL(file, base)));
}

test("«Продукт» и «Решения» ведут в разные места — это и было сломано", () => {
  const panels = NAV_SECTIONS.filter(hasLinks);
  assert.ok(panels.length >= 2, "разделов с панелью должно быть хотя бы два");

  const seen = new Map();
  for (const panel of panels) {
    for (const link of panel.links) {
      const owner = seen.get(link.href);
      assert.equal(
        owner,
        undefined,
        `${link.href} есть и в «${owner}», и в «${panel.label}» — панели снова показывают одно и то же`,
      );
      seen.set(link.href, panel.label);
    }
  }
});

test("каждый раздел с панелью не пустой", () => {
  for (const section of NAV_SECTIONS.filter(hasLinks)) {
    assert.ok(section.links.length > 0, `«${section.label}» без ссылок — кнопка откроет пустоту`);
  }
});

test("подписи разделов не повторяются: по подписи выбирается открытая панель", () => {
  const labels = NAV_SECTIONS.map((section) => section.label);
  assert.equal(new Set(labels).size, labels.length, `повтор в подписях: ${labels.join(", ")}`);
});

test("якорь каждого раздела есть на главной — иначе кнопка не делает ничего", () => {
  // Ровно эта проверка ловит «О нас»: он вёл на `about`, которого на
  // главной нет вовсе, и нажатие просто ничего не делало.
  for (const section of NAV_SECTIONS) {
    if (hasLinks(section)) continue;
    assert.ok(
      landing.includes(`id="${section.anchor}"`),
      `«${section.label}» ведёт на якорь «${section.anchor}», а его на главной нет`,
    );
  }
});

test("каждая ссылка панели ведёт на существующую страницу или на живой якорь", () => {
  for (const section of NAV_SECTIONS.filter(hasLinks)) {
    for (const link of section.links) {
      assert.ok(link.href.startsWith("/"), `${link.href} — ждём путь от корня`);

      const [pathname, anchor] = link.href.split("#");
      if (anchor) {
        assert.equal(pathname, "/", `якоря меню живут только на главной, а тут ${link.href}`);
        assert.ok(
          landing.includes(`id="${anchor}"`),
          `«${link.label}» ведёт на якорь «${anchor}», а его на главной нет`,
        );
        continue;
      }
      assert.ok(routeExists(pathname), `«${link.label}» ведёт на ${pathname}, а такой страницы нет`);
    }
  }
});

test("подписи ссылок не повторяются внутри панели", () => {
  for (const section of NAV_SECTIONS.filter(hasLinks)) {
    const labels = section.links.map((link) => link.label);
    assert.equal(new Set(labels).size, labels.length, `повтор в «${section.label}»: ${labels.join(", ")}`);
  }
});

test("картинка панели существует и у каждого раздела своя", async () => {
  const files = await readdir(new URL("../public/site/", import.meta.url));
  const used = new Set();
  for (const section of NAV_SECTIONS.filter(hasLinks)) {
    const file = section.art.src.replace("/site/", "");
    assert.ok(files.includes(file), `нет файла public/site/${file} — соберите: node scripts/site-art.mjs`);
    assert.ok(!used.has(file), `${file} стоит в двух разделах — панели снова выглядят одинаково`);
    used.add(file);
    assert.ok(section.art.alt.length > 10, `у «${section.label}» пустое описание картинки`);
  }
});

/**
 * Обход всех публичных страниц приложения. Динамические сегменты (`[dish]`)
 * пропускаем: это дети своего раздела, отдельный вход в меню им не нужен.
 */
async function publicPages(dir = new URL("../app/", import.meta.url), prefix = "") {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "page.tsx") found.push(prefix || "/");
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("[") || entry.name.startsWith("_") || entry.name.startsWith("(")) continue;
    // Закрытые разделы: кабинет, админка, Mini App и API.
    if (["app", "admin", "tg", "api"].includes(entry.name) && !prefix) continue;
    found.push(...await publicPages(new URL(`${entry.name}/`, dir), `${prefix}/${entry.name}`));
  }
  return found;
}

test("каждая публичная страница доступна из меню — иначе она есть только в поиске", async () => {
  // Ровно эта проверка нашла три расчёта (калории, белок, темп), которые в
  // меню не попали: люди приходили на них из поиска и не могли уйти дальше.
  const reachable = new Set(
    NAV_SECTIONS.filter(hasLinks).flatMap((s) => s.links.map((l) => l.href.split("#")[0])),
  );
  const missing = (await publicPages())
    .filter((page) => page !== "/")
    .filter((page) => !reachable.has(page))
    .filter((page) => !NAV_EXEMPT.some((skip) => page === skip || page.startsWith(`${skip}/`)));

  assert.deepEqual(missing, [], `нет входа из меню: ${missing.join(", ")}`);
});

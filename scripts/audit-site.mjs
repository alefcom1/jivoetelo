#!/usr/bin/env node
/**
 * Сквозной аудит живого сайта: SEO и мобильная вёрстка.
 *
 *   node scripts/audit-site.mjs            # оба прогона
 *   node scripts/audit-site.mjs seo        # только SEO
 *   node scripts/audit-site.mjs mobile     # только вёрстка
 *
 * Требует поднятой сборки на 127.0.0.1:3111 (или E2E_BASE). Порядок
 * перезапуска standalone-сервера и две ловушки при этом — в docs/handover.md,
 * раздел «Ловушка: перезапуск standalone-сервера»: если статику скопировать
 * ПОСЛЕ старта, страницы отдаются без CSS и аудит рапортует несуществующие
 * переполнения.
 *
 * Скрипт лежит в репозитории, а не в черновиках: он уже дважды терялся
 * вместе с рабочим каталогом, и каждый раз его писали заново.
 */

import { launchBrowser } from "../tests/e2e/browser.mjs";

const BASE = process.env.E2E_BASE ?? "http://127.0.0.1:3111";
const mode = process.argv[2] ?? "all";

/** Ширины: 360 — договорённость продукта, 280 — Galaxy Fold, нижняя граница. */
const VIEWPORTS = [360, 280];
/** Минимальная тач-цель, о которой договорились по всему сайту. */
const MIN_TAP = 38;

const problems = [];

async function auditSeo() {
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  if (paths.length === 0) problems.push("sitemap пуст — аудит SEO ничего не проверил");

  for (const path of paths) {
    const res = await fetch(`${BASE}${path}`);
    if (res.status !== 200) { problems.push(`${path}: HTTP ${res.status}`); continue; }
    const html = await res.text();

    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    if (!title) problems.push(`${path}: нет <title>`);
    // 75 символов: дальше выдача режет, и дифференциатор из заголовка пропадает.
    else if (title.length > 75) problems.push(`${path}: title ${title.length} символов`);

    if (!/<meta name="description" content="[^"]+"/.test(html)) problems.push(`${path}: нет description`);

    const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? "";
    if (!canonical) problems.push(`${path}: нет canonical`);
    else if (!canonical.startsWith("https://jivoetelo.ru")) problems.push(`${path}: canonical ${canonical}`);

    const h1 = [...html.matchAll(/<h1[\s>]/g)].length;
    if (h1 !== 1) problems.push(`${path}: h1 × ${h1}`);

    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const [, raw] of blocks) {
      try { JSON.parse(raw.replace(/\\u003c/g, "<")); }
      catch { problems.push(`${path}: битый JSON-LD`); }
    }
    const noSchemaOk = path.startsWith("/legal") || path === "/login" || path === "/register";
    if (blocks.length === 0 && !noSchemaOk) problems.push(`${path}: нет JSON-LD`);
  }
  console.log(`SEO: проверено ${paths.length} страниц из sitemap`);
  return paths;
}

async function auditMobile(paths) {
  const browser = await launchBrowser();
  try {
    for (const width of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width, height: 640 }, deviceScaleFactor: 2 });
      for (const path of paths) {
        const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
        if (!res || res.status() !== 200) { problems.push(`${width}px ${path}: HTTP ${res?.status()}`); continue; }
        const found = await page.evaluate((minTap) => {
          const out = { over: document.documentElement.scrollWidth - window.innerWidth, wide: [], small: [] };
          if (out.over > 1) {
            for (const el of document.querySelectorAll("*")) {
              const r = el.getBoundingClientRect();
              if (r.right > window.innerWidth + 1 || r.left < -1) {
                out.wide.push(el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : ""));
              }
            }
          }
          // Тач-цели проверяем у самостоятельных элементов управления.
          // Ссылки внутри текста (абзац, список, подпись) исключены
          // сознательно: WCAG 2.5.8 делает для них ровно то же исключение —
          // требовать 44px от слова в предложении означало бы развалить
          // вёрстку текста ради метрики.
          const inlineHost = "p, li, figcaption, h1, h2, h3, td, th, small";
          for (const el of document.querySelectorAll("a, button, input, select, summary")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (el.tagName === "A" && el.closest(inlineHost)) continue;
            if (r.height < minTap || r.width < minTap) {
              out.small.push(`${el.tagName.toLowerCase()} «${(el.textContent ?? "").trim().slice(0, 24)}» ${Math.round(r.width)}×${Math.round(r.height)}`);
            }
          }
          return out;
        }, MIN_TAP);
        if (found.over > 1) {
          problems.push(`${width}px ${path}: горизонтальный скролл +${found.over}px (${[...new Set(found.wide)].slice(0, 4).join(", ")})`);
        }
        for (const small of [...new Set(found.small)]) {
          problems.push(`${width}px ${path}: мелкая цель — ${small}`);
        }
      }
      await page.close();
      console.log(`Вёрстка ${width}px: проверено ${paths.length} страниц`);
    }
  } finally {
    await browser.close();
  }
}

const paths = mode === "mobile"
  ? [...(await (await fetch(`${BASE}/sitemap.xml`)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
  : await auditSeo();

if (mode !== "seo") await auditMobile(paths);

if (problems.length) {
  console.log(`\nПРОБЛЕМЫ (${problems.length}):`);
  for (const problem of problems) console.log(` - ${problem}`);
  process.exit(1);
}
console.log("\nЧисто: SEO и вёрстка без замечаний.");

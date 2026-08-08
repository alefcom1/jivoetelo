#!/usr/bin/env node
/**
 * Готовит скриншоты для статей журнала (/blog).
 *
 *   node scripts/blog-shots.mjs
 *
 * Источник тот же, что у public/app и public/site, — живые снимки из
 * docs/screenshots, которые делает e2e-прогон. Статьи показывают настоящие
 * экраны, а не макеты: правило то же, что у главной (scripts/site-shots.mjs).
 *
 * Ширина 560 для телефонных экранов (в статье они стоят до 280 CSS-пикселей,
 * запас — на плотные экраны) и 1320 для кабинета. Пересобирать после смены
 * интерфейса вместе с app-shots и site-shots.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "public/blog");

const SHOTS = [
  // Статья «Как устроен дневник по фото»
  { from: "tg-ways.png", to: "ways.webp", width: 560 },
  { from: "tg-draft.png", to: "draft.webp", width: 560 },
  { from: "tg-clarify-own.png", to: "clarify.webp", width: 560 },
  // Статья про Telegram
  { from: "tg-today.png", to: "today.webp", width: 560 },
  { from: "tg-diary.png", to: "diary.webp", width: 560 },
  { from: "tg-today-dark.png", to: "today-dark.webp", width: 560 },
  // Ручной путь и подсказки — статьи про сравнение и норму
  { from: "tg-manual-entry.png", to: "manual.webp", width: 560 },
  { from: "tg-suggest.png", to: "suggest.webp", width: 560 },
  // Веб-кабинет
  { from: "site-cabinet.png", to: "cabinet.webp", width: 1320 },
];

await mkdir(out, { recursive: true });

for (const shot of SHOTS) {
  const file = resolve(out, shot.to);
  await sharp(resolve(root, "docs/screenshots", shot.from))
    .resize({ width: shot.width })
    .webp({ quality: 82 })
    .toFile(file);
  const { width, height, size } = await sharp(file).metadata();
  console.log(`  ok   public/blog/${shot.to} — ${width}×${height}, ${Math.round((size ?? 0) / 1024)} КБ`);
}

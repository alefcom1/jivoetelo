#!/usr/bin/env node
/**
 * Готовит иллюстрации главной из исходников в docs/illustrations.
 *
 *   node scripts/site-art.mjs
 *
 * ## Почему исходники лежат в репозитории
 *
 * Кадры сгенерированы по промптам из docs/site-home-plan.md, но генерация
 * недетерминирована: тот же промпт второй раз даст другую картинку. Значит
 * исходник — единственный способ пересобрать иллюстрацию в другом размере или
 * с другим кадром, и он должен быть под рукой.
 *
 * Хранятся они в webp с качеством 92, а не в исходном PNG: разница на глаз не
 * ловится, а репозиторий легче на порядок (15 МБ против полутора). Клонировать
 * его будут ещё много раз.
 *
 * ## Почему у каждой картинки свой размер
 *
 * Ширина подобрана под то место, где картинка стоит, с полуторным запасом на
 * плотные экраны. Отдавать снимок втрое шире, чем нужно, — это секунды
 * загрузки на мобильном интернете ради резкости, которой никто не увидит.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "public/site");

const ART = [
  // Триптих: три колонки в сетке до 1280 — около 400 CSS на кадр.
  { name: "day-morning", width: 640 },
  { name: "day-noon", width: 640 },
  { name: "day-evening", width: 640 },
  // Половина секции, примерно 600 CSS.
  { name: "range", width: 960 },
  { name: "boundaries", width: 960 },
  // Полоса во всю ширину колонки.
  { name: "calculators", width: 1920 },
  // На главной не используется — кадр для страницы /pro.
  { name: "pro-talk", width: 960 },
];

await mkdir(outDir, { recursive: true });

for (const { name, width } of ART) {
  const info = await sharp(resolve(root, `docs/illustrations/${name}.webp`))
    .resize({ width })
    .webp({ quality: 82 })
    .toFile(resolve(outDir, `${name}.webp`));
  console.log(`  ok   public/site/${name}.webp — ${info.width}×${info.height}, ${Math.round(info.size / 1024)} КБ`);
}

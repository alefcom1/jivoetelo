#!/usr/bin/env node
/**
 * Готовит скриншоты Mini App для сайта.
 *
 *   node scripts/app-shots.mjs
 *
 * Берёт живые снимки из docs/screenshots (их делает e2e-прогон вместе с
 * остальной документацией) и кладёт в public/app облегчёнными.
 *
 * Три, а не восемь: больше трёх превращается в галерею, которую не листают.
 * Выбраны те, что отвечают на разные вопросы — «что я увижу каждый день»,
 * «как это работает» и «откуда цифры», а не три вида одного экрана.
 *
 * WebP и ширина 560: на сайте картинка показывается примерно в 280 CSS-пикселей,
 * то есть с запасом на плотные экраны. Исходные 780 px не нужны никому и
 * стоят лишних килобайт на каждом заходе.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "public/app");

const SHOTS = [
  { from: "tg-today.png", to: "today.webp" },
  { from: "tg-draft.png", to: "camera.webp" },
  { from: "tg-plan.png", to: "plan.webp" },
];

await mkdir(out, { recursive: true });

for (const shot of SHOTS) {
  const file = resolve(out, shot.to);
  await sharp(resolve(root, "docs/screenshots", shot.from))
    .resize({ width: 560 })
    .webp({ quality: 82 })
    .toFile(file);
  const { width, height, size } = await sharp(file).metadata();
  console.log(`  ok   public/app/${shot.to} — ${width}×${height}, ${Math.round((size ?? 0) / 1024)} КБ`);
}

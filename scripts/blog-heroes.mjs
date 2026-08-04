#!/usr/bin/env node
/**
 * Готовит заглавные иллюстрации статей журнала.
 *
 *   node scripts/blog-heroes.mjs <каталог-с-исходниками>
 *
 * Исходники — PNG из генератора (промпты в docs/blog-illustrations.md).
 * В репозиторий кладём только сжатые webp: пять исходных PNG весят 10 МБ,
 * а результат — около 400 КБ на все пять.
 *
 * ## Два размера на каждую статью
 *
 * `hero-<slug>.webp` — 1600 px: обложка статьи и карточка на хабе, где
 * картинка занимает всю ширину колонки, а на плотных экранах ещё вдвое
 * больше.
 *
 * `hero-<slug>-card.webp` — 800 px: карточки журнала на главной и в сетке
 * хаба. Там картинка показывается в 300–560 CSS-пикселей, и грузить ради
 * неё полуторамегабайтный файл незачем.
 *
 * Соответствие «файл → статья» задаётся руками в MAP ниже: у выгрузки из
 * генератора имена вида «ChatGPT Image … (3).png», и угадывать по ним
 * нечего. Сюжеты сверены глазами.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "public/blog");
const from = process.argv[2];

if (!from) {
  console.error("Укажите каталог с исходниками: node scripts/blog-heroes.mjs <каталог>");
  process.exit(1);
}

/** Файл исходника → слаг статьи. Сюжеты сверены с текстами. */
const MAP = [
  { file: "ChatGPT Image 4 авг. 2026 г., 08_49_44 (3).png", slug: "kak-ustroen-dnevnik-po-foto" },
  { file: "ChatGPT Image 4 авг. 2026 г., 08_49_44 (4).png", slug: "sravnenie-prilozhenij-dlya-podscheta-kalorij" },
  { file: "ChatGPT Image 4 авг. 2026 г., 08_49_44 (5).png", slug: "dnevnik-pitaniya-v-telegram" },
  { file: "ChatGPT Image 4 авг. 2026 г., 08_49_44 (2).png", slug: "pochemu-diapazon-chestnee-tochnogo-chisla" },
  { file: "ChatGPT Image 4 авг. 2026 г., 08_49_44 (1).png", slug: "norma-kalorij-kotoraya-uchitsya" },
];

const SIZES = [
  { suffix: "", width: 1600, quality: 80 },
  { suffix: "-card", width: 800, quality: 78 },
];

await mkdir(out, { recursive: true });

for (const item of MAP) {
  for (const size of SIZES) {
    const name = `hero-${item.slug}${size.suffix}.webp`;
    const file = resolve(out, name);
    await sharp(resolve(from, item.file))
      .resize({ width: size.width })
      .webp({ quality: size.quality })
      .toFile(file);
    const { width, height, size: bytes } = await sharp(file).metadata();
    console.log(`  ok   public/blog/${name} — ${width}×${height}, ${Math.round((bytes ?? 0) / 1024)} КБ`);
  }
}

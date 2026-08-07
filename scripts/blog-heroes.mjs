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
  { file: "ChatGPT Image 7 авг. 2026 г., 07_02_42.png", slug: "myagkaya-disciplina-dlya-tela" },
];

/**
 * Иллюстрации внутри статей. Отдельно от обложек, потому что размер другой:
 * фигура в тексте шире 760 px не показывается никогда (колонка статьи), и
 * полуторатысячный файл здесь — чистый вес страницы.
 *
 * Имя задаётся руками: у фигуры нет слага, зато есть смысл, и `sreda`
 * читается в разметке лучше, чем `figure-3`.
 */
const FIGURES = [
  { file: "ChatGPT Image 7 авг. 2026 г., 07_01_47.png", name: "privychka-shagi" },
  { file: "ChatGPT Image 7 авг. 2026 г., 07_04_49.png", name: "sreda-ugolok" },
  { file: "ChatGPT Image 7 авг. 2026 г., 07_05_23.png", name: "nedelya-tochki" },
];

/**
 * Обложки кадрируются в 16:9, а не масштабируются как есть.
 *
 * Генератор отдаёт что 16:9, что 4:3 — и статья с обложкой 4:3 занимала
 * первым экраном на 140 px больше соседних. На одной странице это незаметно,
 * в хабе рядом — сразу видно, что сетка «дышит». Кадрирование по центру
 * дешевле, чем просить перерисовать.
 */
const SIZES = [
  { suffix: "", width: 1600, height: 900, quality: 80 },
  { suffix: "-card", width: 800, height: 450, quality: 78 },
];

await mkdir(out, { recursive: true });

async function convert(source, name, resize, quality) {
  const file = resolve(out, name);
  await sharp(resolve(from, source)).resize(resize).webp({ quality }).toFile(file);
  const meta = await sharp(file).metadata();
  console.log(`  ok   public/blog/${name} — ${meta.width}×${meta.height}, ${Math.round((meta.size ?? 0) / 1024)} КБ`);
}

for (const item of MAP) {
  for (const size of SIZES) {
    const resize = { width: size.width, height: size.height, fit: "cover", position: "centre" };
    await convert(item.file, `hero-${item.slug}${size.suffix}.webp`, resize, size.quality);
  }
}

// Фигуры внутри статьи кадрировать нельзя: у схемы обрезка съест стрелку, у
// снимка — половину сюжета. Здесь только ширина, пропорции родные.
for (const figure of FIGURES) {
  await convert(figure.file, `${figure.name}.webp`, { width: 1400 }, 80);
}

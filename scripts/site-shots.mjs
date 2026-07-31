#!/usr/bin/env node
/**
 * Готовит снимки кабинета и кабинета специалиста для главной страницы.
 *
 *   node scripts/site-shots.mjs
 *
 * ## Почему снимки, а не вёрстка
 *
 * До этого на главной стояли два макета, собранные руками из div'ов: «личный
 * кабинет» с колонкой разделов «Сегодня / Дневник / План / Динамика» и панель
 * Pro со строчками клиентов и бейджами «Стабильный ритм» / «Нужна поддержка».
 *
 * Ни того, ни другого в продукте не существует. Разделы в кабинете другие, а
 * оценок состояния человека («стабильный ритм») мы не делаем сознательно —
 * это ровно тот способ разговора, от которого продукт отказывается. Макет
 * обещал не просто «примерно так», а другое приложение.
 *
 * Снимок обещает ровно то, что человек увидит. Цена — он стареет вместе с
 * интерфейсом; поэтому исходники лежат в docs/screenshots, а не только
 * готовые webp, и пересобрать их можно этой командой.
 *
 * ## Как получены исходники
 *
 * Playwright, ширина окна 1440, DPR 2, база с демонстрационными данными.
 * Порядок клиентов в списке — по дате принятия приглашения, свежие сверху.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "public/site");

/**
 * Кадры заданы в пикселях исходника (DPR 2, то есть вдвое больше CSS).
 * `width` — итоговая ширина webp: блок на главной занимает до 1280 CSS,
 * полуторный запас держит текст резким и не раздувает файл вчетверо.
 */
const SHOTS = [
  {
    src: "docs/screenshots/site-cabinet.png",
    out: "cabinet.webp",
    // Целиком, вместе с шапкой: она часть кабинета и объясняет, где человек.
    crop: { left: 0, top: 0, width: 2880, height: 1800 },
    width: 1920,
  },
  {
    src: "docs/screenshots/site-pro.png",
    out: "pro.webp",
    // Без шапки раздела и без подвала: нужен сам список клиентов.
    crop: { left: 460, top: 240, width: 1960, height: 960 },
    width: 1320,
  },
];

await mkdir(outDir, { recursive: true });

for (const shot of SHOTS) {
  const info = await sharp(resolve(root, shot.src))
    .extract(shot.crop)
    .resize({ width: shot.width })
    .webp({ quality: 86 })
    .toFile(resolve(outDir, shot.out));
  console.log(`  ok   public/site/${shot.out} — ${info.width}×${info.height}, ${Math.round(info.size / 1024)} КБ`);
}

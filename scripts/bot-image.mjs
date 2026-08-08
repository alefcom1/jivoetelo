#!/usr/bin/env node
/**
 * Собирает картинку, которую бот показывает на /start.
 *
 *   node scripts/bot-image.mjs
 *
 * Почему генератор лежит в репозитории, а не «нарисовали один раз и забыли».
 * Картинка — это кадр нашего же интерфейса, и он устаревает вместе с ним:
 * поменяли кольцо на «Сегодня» — приветствие бота показывает прошлогодний
 * экран. Скрипт делает пересборку одной командой и фиксирует, из чего именно
 * картинка собрана.
 *
 * Источник — docs/screenshots/tg-today.png, живой снимок Mini App, снятый
 * тем же e2e-прогоном, что и остальные скриншоты в документации. Стоки мы не
 * берём по тем же причинам, что и в самом Mini App (docs/miniapp-v2.md):
 * чужая тарелка на приветствии обещает не то, что внутри.
 *
 * Текста в картинке нет намеренно. Во-первых, брендовый Cormorant Garamond
 * лежит в репозитории как woff2, а растеризатор SVG работает с системными
 * шрифтами — подпись вышла бы чужой гарнитурой. Во-вторых, текст в картинке
 * не переводится, не выделяется и не читается скринридером, а у сообщения
 * есть подпись, где всё это работает.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const SOURCE = resolve(root, "docs/screenshots/tg-today.png");
const OUT = resolve(root, "public/bot/welcome.jpg");

/**
 * Приём взят с самого сайта, а не придуман: в секции «для специалистов»
 * (`.pro-screen` в app/globals.css) бумажный экран лежит на чёрном фоне с
 * жёсткой коралловой тенью со сдвигом. Первая версия этой картинки ставила
 * снимок на бумажный фон — и граница карточки просто исчезла, потому что фон
 * снимка ровно того же цвета.
 */
const INK = { r: 0x17, g: 0x19, b: 0x17 };
const CORAL = "#e56d55";

/**
 * Снимок обрезаем сразу под карточкой макросов. Ниже идут тренд веса и «что
 * съесть сейчас» — они хороши на экране, но на картинке в переписке
 * превращаются в нечитаемую мелочь: чем меньше строк, тем крупнее каждая.
 */
const CROP = { left: 0, top: 0, width: 780, height: 1060 };

/** Ширина снимка на карточке. Telegram показывает фото примерно в 500 px —
 * при таком масштабе содержимое выходит близким к натуральному размеру. */
const SHOT_WIDTH = 700;
const MARGIN = 80;
/** Сдвиг коралловой тени. На сайте 17 px при экране вдвое уже — здесь 20. */
const OFFSET = 20;

const shot = await sharp(SOURCE)
  .extract(CROP)
  .resize({ width: SHOT_WIDTH })
  .toBuffer();
const { width: shotW = SHOT_WIDTH, height: shotH = 0 } = await sharp(shot).metadata();

const canvasW = shotW + MARGIN * 2 + OFFSET;
const canvasH = shotH + MARGIN * 2 + OFFSET;

const coral = Buffer.from(
  `<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" fill="${CORAL}"/></svg>`,
);

await mkdir(resolve(root, "public/bot"), { recursive: true });

await sharp({
  create: { width: canvasW, height: canvasH, channels: 3, background: INK },
})
  .composite([
    { input: coral, left: MARGIN + OFFSET, top: MARGIN + OFFSET },
    { input: shot, left: MARGIN, top: MARGIN },
  ])
  // Прогрессивный JPEG: Telegram отдаёт превью до полной загрузки.
  .jpeg({ quality: 84, progressive: true, mozjpeg: true })
  .toFile(OUT);

const { size } = await sharp(OUT).metadata();
console.log(`  ok   ${OUT} — ${canvasW}×${canvasH}, ${Math.round((size ?? 0) / 1024)} КБ`);

/**
 * Вторая карточка: грустный Живело для седьмого дня тишины
 * (lib/reminders.ts, лестница молчания).
 *
 * Собирается здесь же, а не отдельным скриптом: обе картинки бота — это одна
 * задача «пересобрать то, что бот показывает», и две команды вместо одной
 * означают, что однажды выполнят только первую.
 *
 * Фон — фирменная бумага, а не чёрный: приветствие показывает экран
 * приложения и требует контраста, а тут персонаж, и тёмная плашка делает из
 * грусти траур.
 */
const MASCOT = resolve(root, "public/mascot/sad.webp");
const MISSING_OUT = resolve(root, "public/bot/missing.jpg");
const PAPER = { r: 0xf4, g: 0xf1, b: 0xea };
/** Квадрат: Telegram показывает подпись под фото, и высокая картинка съедает
 * экран целиком — а текст здесь важнее картинки. */
const MISSING_SIDE = 640;

const mascot = await sharp(MASCOT)
  .resize({ width: Math.round(MISSING_SIDE * 0.62) })
  .toBuffer();

await sharp({ create: { width: MISSING_SIDE, height: MISSING_SIDE, channels: 3, background: PAPER } })
  .composite([{ input: mascot, gravity: "center" }])
  .jpeg({ quality: 86, progressive: true, mozjpeg: true })
  .toFile(MISSING_OUT);

const missing = await sharp(MISSING_OUT).metadata();
console.log(`  ok   ${MISSING_OUT} — ${MISSING_SIDE}×${MISSING_SIDE}, ${Math.round((missing.size ?? 0) / 1024)} КБ`);

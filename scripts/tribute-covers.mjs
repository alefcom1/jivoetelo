#!/usr/bin/env node
/**
 * Обложки товаров в кабинете Tribute — по одной на тариф.
 *
 *   node scripts/tribute-covers.mjs
 *
 * Tribute показывает товар карточкой: обложка, название, цена. Название и
 * цену он рисует сам, поэтому на картинке их нет — дублировать значит
 * получить две цены в одном кадре и однажды разойтись с настоящей.
 *
 * Текста нет и по второй причине, той же, что в scripts/bot-image.mjs:
 * брендовые Cormorant Garamond и Manrope лежат в репозитории как woff2, а
 * растеризатор SVG берёт системные шрифты. Подпись вышла бы чужой
 * гарнитурой — хуже, чем её отсутствие.
 *
 * Источник — живые снимки Mini App из docs/screenshots, те же, что в
 * документации. Стоки не берём по причине из docs/miniapp-v2.md: чужая
 * тарелка на обложке обещает не то, что внутри.
 *
 * Тарифы отличаются только сроком, поэтому и обложки отличаются только
 * экраном: «Сегодня» и «План». Рисовать годовому тарифу что-то более
 * богатое было бы враньём — возможности у них одинаковые.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");

/** Приём с самого сайта: бумажный экран на чёрном фоне с жёсткой коралловой
 * тенью со сдвигом (`.pro-screen` в app/globals.css). На бумажном фоне
 * граница карточки исчезает — снимок ровно того же цвета. */
const INK = { r: 0x17, g: 0x19, b: 0x17 };
const CORAL = "#e56d55";

/**
 * Квадрат. Какое соотношение сторон Tribute показывает в ленте, а какое в
 * карточке товара, снаружи не видно, и квадрат — единственный формат, который
 * переживает обрезку и в горизонталь, и в вертикаль без потери середины.
 */
const SIDE = 1080;
/** Сдвиг коралловой тени. На сайте 17 px при экране вдвое уже — здесь 20. */
const OFFSET = 20;

const COVERS = [
  {
    // Месяц — экран «Сегодня»: кольцо и макросы, то, ради чего сервис
    // открывают каждый день.
    source: "docs/screenshots/tg-today.png",
    out: "public/payments/tribute-month.jpg",
    crop: { left: 0, top: 0, width: 780, height: 1060 },
  },
  {
    // Год — «Дневник»: цифры цветом и список приёмов пищи читаются даже
    // миниатюрой. Первым кандидатом был «План», но он почти целиком текст, а
    // обложка живёт в ленте размером с ноготь — там стена букв превращается
    // в серый прямоугольник.
    source: "docs/screenshots/tg-diary.png",
    out: "public/payments/tribute-year.jpg",
    // Кадр кончается под кнопкой «Добавить запись»: обрезанный на середине
    // элемент читается как сбой вёрстки, а не как кадрирование.
    crop: { left: 0, top: 0, width: 780, height: 950 },
  },
];

await mkdir(resolve(root, "public/payments"), { recursive: true });

for (const cover of COVERS) {
  const crop = cover.crop;
  // Высота снимка задаёт масштаб: снимок должен уместиться в квадрат с полями,
  // а не наоборот. При обратном порядке узкий кадр упирался бы в низ.
  const shotH = Math.round(SIDE * 0.78);
  const shotW = Math.round((crop.width / crop.height) * shotH);

  const shot = await sharp(resolve(root, cover.source))
    .extract(crop)
    .resize({ width: shotW, height: shotH })
    .toBuffer();

  const left = Math.round((SIDE - shotW - OFFSET) / 2);
  const top = Math.round((SIDE - shotH - OFFSET) / 2);

  const coral = Buffer.from(
    `<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" fill="${CORAL}"/></svg>`,
  );

  const out = resolve(root, cover.out);
  await sharp({ create: { width: SIDE, height: SIDE, channels: 3, background: INK } })
    .composite([
      { input: coral, left: left + OFFSET, top: top + OFFSET },
      { input: shot, left, top },
    ])
    .jpeg({ quality: 88, progressive: true, mozjpeg: true })
    .toFile(out);

  const { size } = await sharp(out).metadata();
  console.log(`  ok   ${cover.out} — ${SIDE}×${SIDE}, ${Math.round((size ?? 0) / 1024)} КБ`);
}

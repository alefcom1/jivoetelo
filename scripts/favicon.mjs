#!/usr/bin/env node
/**
 * Собирает набор значков сайта из public/favicon.svg.
 *
 *   node scripts/favicon.mjs
 *
 * ## Зачем, если SVG уже есть
 *
 * SVG-фавикон понимают браузеры — и почти никто больше. Сервисы, которые
 * показывают значок сайта рядом с его именем (поиск Яндекса, список счётчиков
 * в Метрике, превью ссылок), забирают его отдельным роботом и растровым
 * форматом. Для них сайт, у которого есть только SVG, выглядит как сайт без
 * значка вовсе: в списке появляется серый глобус.
 *
 * Заметить это по своему браузеру невозможно — там значок как раз виден.
 *
 * ## Что кладём
 *
 * | Файл | Кто читает |
 * |---|---|
 * | `favicon.ico` | роботы значков, старые браузеры, адрес по умолчанию |
 * | `favicon-32.png`, `favicon-96.png` | те же роботы, если предпочитают PNG |
 * | `apple-touch-icon.png` | iOS при добавлении на домашний экран |
 * | `favicon.svg` | современные браузеры, остаётся как есть |
 *
 * `favicon.ico` лежит именно в корне и именно с этим именем: робот приходит
 * туда, даже если в разметке указано другое, — это адрес по умолчанию с
 * девяностых.
 *
 * ## Про ICO
 *
 * ICO — контейнер: заголовок, таблица записей по 16 байт и сами картинки.
 * Внутрь кладём PNG (так делают все с конца нулевых) в трёх размерах: 16 для
 * вкладки, 32 для списков, 48 для панели закладок. Отдельной библиотеки ради
 * шестнадцати байт заголовка не берём.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "public/favicon.svg");

/** Размеры внутри .ico. Больше 48 туда класть незачем — читают только эти. */
const ICO_SIZES = [16, 32, 48];

const PNG_FILES = [
  { file: "favicon-32.png", size: 32 },
  { file: "favicon-96.png", size: 96 },
  // 180 — размер, который просит iOS; меньше она растянет и замылит.
  // Без прозрачности: iOS подставляет под значок чёрный фон и накладывает
  // свою скруглённую маску. Прозрачные углы у уже скруглённого знака дали бы
  // чёрные уголки и скругление поверх скругления.
  { file: "apple-touch-icon.png", size: 180, flatten: true },
];

/** Цвет подложки — тот же бумажный, что залит в самом SVG. */
const PAPER = { r: 0xff, g: 0xfe, b: 0xfa };

/** Растеризует SVG в PNG заданной стороны. */
async function render(size, flatten = false) {
  const image = sharp(await readFile(source), { density: 384 })
    .resize(size, size, { fit: "contain", background: { ...PAPER, alpha: 0 } });
  return await (flatten ? image.flatten({ background: PAPER }) : image)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Собирает контейнер ICO из готовых PNG.
 *
 * Формат: ICONDIR (6 байт) + по ICONDIRENTRY (16 байт) на каждый размер +
 * сами данные подряд. В записи ширина и высота — по одному байту, поэтому
 * 256 пишется нулём; у нас таких размеров нет, но правило стоит помнить.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // зарезервировано, всегда 0
  header.writeUInt16LE(1, 2); // тип: 1 — значок
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // цветов в палитре — 0 для полноцвета
    entry.writeUInt8(0, 3); // зарезервировано
    entry.writeUInt16LE(1, 4); // плоскостей
    entry.writeUInt16LE(32, 6); // бит на пиксель
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const icoImages = [];
for (const size of ICO_SIZES) icoImages.push({ size, data: await render(size) });
const ico = buildIco(icoImages);
await writeFile(resolve(root, "public/favicon.ico"), ico);
console.log(`  ok   public/favicon.ico — ${ICO_SIZES.join(", ")} px, ${Math.round(ico.length / 1024)} КБ`);

for (const { file, size, flatten } of PNG_FILES) {
  const data = await render(size, flatten);
  await writeFile(resolve(root, `public/${file}`), data);
  console.log(`  ok   public/${file} — ${size}×${size}, ${Math.round(data.length / 1024)} КБ`);
}

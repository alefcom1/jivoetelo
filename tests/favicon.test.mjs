import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import sharp from "sharp";

/**
 * Значок сайта — тот случай, когда «у меня в браузере всё видно» ничего не
 * доказывает: браузер читает SVG, а роботы, рисующие значок рядом с именем
 * сайта, — нет. Поэтому проверяем не «файл лежит», а что внутри него.
 */

const ICO = "public/favicon.ico";
const EXPECTED_SIZES = [16, 32, 48];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("favicon.ico — настоящий контейнер с обещанными размерами", async () => {
  const ico = await readFile(ICO);

  assert.equal(ico.readUInt16LE(0), 0, "первые два байта зарезервированы");
  assert.equal(ico.readUInt16LE(2), 1, "тип 1 — значок, а не курсор");
  const count = ico.readUInt16LE(4);
  assert.equal(count, EXPECTED_SIZES.length);

  const sizes = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const width = ico.readUInt8(entry);
    const height = ico.readUInt8(entry + 1);
    assert.equal(width, height, "значок должен быть квадратным");
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);

    // Битая таблица смещений — самая вероятная ошибка при ручной сборке
    // контейнера, и снаружи она выглядит как «значок просто не появился».
    assert.ok(offset + length <= ico.length, `запись ${width} указывает за конец файла`);
    assert.deepEqual(
      ico.subarray(offset, offset + PNG_SIGNATURE.length),
      PNG_SIGNATURE,
      `внутри записи ${width} не PNG`,
    );

    const meta = await sharp(ico.subarray(offset, offset + length)).metadata();
    assert.equal(meta.width, width, `запись обещает ${width}, а картинка ${meta.width}`);
    sizes.push(width);
  }

  assert.deepEqual(sizes, EXPECTED_SIZES);
});

test("у SVG собственный размер не меньше 48 и кратен 48", async () => {
  // Google требует от значка квадрат, кратный 48 пикселям. Браузер к SVG это
  // не применяет — он растянет по viewBox на любой размер, — а вот всё, что
  // рисует картинку по объявленным width/height, получит ровно их.
  //
  // Здесь это было настоящим расхождением: рисунок в 1044 единицы объявлял
  // себя размером 24×24. В браузере незаметно, у робота — самый мелкий из
  // всех наших значков и вдвое меньше минимума.
  const svg = await readFile("public/favicon.svg", "utf8");
  const width = Number(svg.match(/\bwidth="(\d+)"/)?.[1]);
  const height = Number(svg.match(/\bheight="(\d+)"/)?.[1]);

  assert.equal(width, height, "значок должен быть квадратным");
  assert.ok(width >= 48, `объявлено ${width}px — меньше минимума Google в 48`);
  assert.equal(width % 48, 0, `${width}px не кратно 48`);

  // viewBox обязан остаться: без него width/height становятся единственным
  // размером, и значок перестаёт масштабироваться без потерь.
  assert.match(svg, /viewBox="0 0 \d+ \d+"/, "у SVG пропал viewBox");
});

test("apple-touch-icon без прозрачности", async () => {
  // iOS подкладывает под значок чёрный фон и накладывает свою маску:
  // прозрачные углы у уже скруглённого знака дали бы чёрные уголки.
  const { data, info } = await sharp("public/apple-touch-icon.png")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 180);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) assert.fail(`пиксель ${(i - 3) / 4} полупрозрачный`);
  }
});

test("всё, что обещано в разметке, лежит в public", async () => {
  // Обратная ошибка не менее вероятна: файл сгенерировали, а объявить забыли
  // — или объявили то, чего никто не собирает. Сверяем оба направления.
  const layout = await readFile("app/layout.tsx", "utf8");
  // Только блок icons: в файле есть и картинка для соцсетей, и она тоже
  // объявлена через url — без границ блока тест ловил бы её.
  const block = layout.match(/icons: \{[\s\S]*?\n {2}\},/);
  assert.ok(block, "в layout не нашёлся блок icons");
  const declared = [...block[0].matchAll(/"(\/[\w.-]+)"/g)].map((m) => m[1]);

  const expected = ["/favicon.ico", "/favicon-32.png", "/favicon-96.png", "/favicon.svg", "/apple-touch-icon.png"];
  for (const file of expected) {
    assert.ok(declared.includes(file), `${file} собирается, но не объявлен в layout`);
    const bytes = await readFile(`public${file}`);
    assert.ok(bytes.length > 0, `${file} объявлен, но пустой`);
  }
  for (const file of new Set(declared)) {
    assert.ok(expected.includes(file), `${file} объявлен, но его никто не собирает`);
  }
});

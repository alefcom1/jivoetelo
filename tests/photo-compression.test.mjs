import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { compressPhotoForAi } from "../lib/ai/image.ts";

/**
 * Сжатие фото перед отправкой в AI (lib/ai/image.ts, docs/ai-proxy.md) —
 * самый крупный рычаг экономии токенов зрения. Картинки здесь синтетические
 * (генерируются sharp'ом в памяти) — важна не конкретная еда на снимке,
 * а геометрия и формат до и после.
 */

/** Однотонный PNG заданного размера — достаточно, чтобы проверить геометрию. */
function makePng(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 140, b: 90 } } })
    .png()
    .toBuffer();
}

test("большое фото — как с телефона — уменьшается до 1024 px по длинной стороне", async () => {
  // Типичное разрешение телефонной камеры (портрет): 3024×4032.
  const original = await makePng(3024, 4032);
  const result = await compressPhotoForAi(original);
  assert.notEqual(result, null, "фото больше предела должно быть сжато");
  assert.equal(result.mediaType, "image/jpeg");

  const meta = await sharp(result.data).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(Math.max(meta.width, meta.height), 1024, "длинная сторона должна упереться ровно в предел");
  // Пропорции (3024:4032 = 3:4) сохраняются с точностью до округления пикселя.
  const originalRatio = 3024 / 4032;
  const resultRatio = meta.width / meta.height;
  assert.ok(Math.abs(originalRatio - resultRatio) < 0.01, `пропорции съехали: ${originalRatio} → ${resultRatio}`);
});

test("сжатый файл заметно легче исходного — ради этого всё и делается", async () => {
  const original = await makePng(3024, 4032);
  const result = await compressPhotoForAi(original);
  assert.ok(
    result.data.length < original.length / 4,
    `ожидали кратное уменьшение, вышло ${original.length} → ${result.data.length}`,
  );
});

test("маленькое фото не трогаем: возвращаем null, а не пересжимаем без пользы", async () => {
  // Токены зрения считаются от числа пикселей, а не от байтов — если
  // геометрия уже в пределах, перекодирование в JPEG токенов не сэкономит,
  // а прозрачность или качество может испортить зря.
  const small = await makePng(640, 480);
  const result = await compressPhotoForAi(small);
  assert.equal(result, null);
});

test("апскейла нет: фото ровно на пороге не увеличивается и не пересжимается", async () => {
  const atLimit = await makePng(1024, 768);
  const result = await compressPhotoForAi(atLimit);
  assert.equal(result, null, "1024 по длинной стороне — уже в пределах, трогать нечего");
});

test("апскейла нет: узкое длинное фото не растягивает короткую сторону при сжатии", async () => {
  // Длинная сторона (3000) выше предела — сжатие происходит, но короткая
  // сторона (40) не должна раздуться до 1024: fit:"inside" масштабирует
  // обе стороны одним коэффициентом, а withoutEnlargement страхует от
  // случайного апскейла.
  const original = await makePng(3000, 40);
  const result = await compressPhotoForAi(original);
  assert.notEqual(result, null);
  const meta = await sharp(result.data).metadata();
  assert.equal(meta.width, 1024);
  assert.ok(meta.height <= 40, `короткая сторона не должна расти: было 40, стало ${meta.height}`);
});

test("падение сжатия не роняет разбор: битые данные дают null, а не исключение", async () => {
  const garbage = Buffer.from("это не картинка, а текст, притворяющийся файлом");
  await assert.doesNotReject(async () => {
    const result = await compressPhotoForAi(garbage);
    assert.equal(result, null, "на неразбираемых данных функция должна тихо сдаться");
  });
});

test("падение сжатия не роняет разбор: пустой буфер тоже не бросает исключение", async () => {
  await assert.doesNotReject(async () => {
    const result = await compressPhotoForAi(Buffer.alloc(0));
    assert.equal(result, null);
  });
});

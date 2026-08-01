import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { compressPhotoForAi } from "../lib/ai/image.ts";

/**
 * Подготовка фото перед отправкой в AI (lib/ai/image.ts, docs/ai-proxy.md).
 * Проверяем оба ограничения — по пикселям (сколько стоит разбор) и по
 * байтам (доедет ли запрос вообще). Картинки синтетические: важна не
 * конкретная еда на снимке, а геометрия, формат и вес до и после.
 */

/** Однотонный PNG заданного размера — достаточно, чтобы проверить геометрию. */
function makePng(width, height) {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 140, b: 90 } } })
    .png()
    .toBuffer();
}

/**
 * Кадр, похожий по «сжимаемости» на настоящую тарелку.
 *
 * Однотонная заливка жмётся до килобайтов, и бюджет по весу на ней не
 * проверишь — он никогда не сработает. Чистый шум — другая крайность:
 * кодеку в нём нечего сжимать, и такой кадр не влезет ни в какой бюджет.
 * Поэтому берём шум низкого разрешения и растягиваем вверх: получаются
 * плавные цветные пятна, а `detail` задаёт, насколько кадр мелкий и
 * пёстрый. Чем больше пятен, тем тяжелее файл.
 */
async function makePhotoLike(width, height, detail) {
  const blockWidth = Math.max(2, Math.round(width / detail));
  const blockHeight = Math.max(2, Math.round(height / detail));
  const pixels = Buffer.allocUnsafe(blockWidth * blockHeight * 3);
  // Детерминированный «шум»: тест не должен зависеть от удачи Math.random.
  let seed = 12345;
  for (let i = 0; i < pixels.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    // Берём старшие биты, а не младшие: у линейного генератора младшие
    // разряды повторяются с коротким периодом, и «шум» выходит узорчатым.
    pixels[i] = (seed >> 16) & 0xff;
  }
  return sharp(pixels, { raw: { width: blockWidth, height: blockHeight, channels: 3 } })
    .resize(width, height, { kernel: "lanczos3" })
    .png()
    .toBuffer();
}

test("большое фото — как с телефона — уменьшается до 1024 px по длинной стороне", async () => {
  // Типичное разрешение телефонной камеры (портрет): 3024×4032.
  const original = await makePng(3024, 4032);
  const result = await compressPhotoForAi(original);
  assert.notEqual(result, null, "фото больше предела должно быть сжато");
  assert.equal(result.mediaType, "image/webp");

  const meta = await sharp(result.data).metadata();
  assert.equal(meta.format, "webp");
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

test("пёстрый снимок ужимается в бюджет тела — иначе запрос виснет на пути к прокси", async () => {
  // Кадр телефонного разрешения, мелкий и пёстрый: одного resize мало —
  // на первой ступени качества он даёт под 270 КБ. Ради таких снимков и
  // заведены ступени: вес должен уложиться в 180 КБ.
  const original = await makePhotoLike(2048, 1536, 8);
  const result = await compressPhotoForAi(original);
  assert.notEqual(result, null);
  assert.ok(
    result.data.length <= 180 * 1024,
    `тело не уложилось в бюджет: ${Math.round(result.data.length / 1024)} КБ`,
  );
});

test("снимок в пределах по пикселям, но тяжёлый по весу — всё равно пересжимается", async () => {
  // Раньше такой кадр уходил в модель как есть: «геометрия в порядке,
  // токенов перекодирование не сэкономит». Токенов — да, но байты именно
  // на нём и упирались в прокси.
  const heavy = await makePhotoLike(1000, 1000, 8);
  assert.ok(heavy.length > 180 * 1024, "проверка теста: исходник должен быть тяжёлым");

  const result = await compressPhotoForAi(heavy);
  assert.notEqual(result, null, "тяжёлый снимок нельзя отправлять как есть");
  assert.ok(result.data.length < heavy.length, "после пересжатия он должен полегчать");

  const meta = await sharp(result.data).metadata();
  assert.equal(meta.width, 1000, "пиксели трогать незачем — они и так в пределах");
  assert.equal(meta.height, 1000);
});

test("пересжатие тяжелее оригинала не отправляется: возвращаем null и шлём как есть", async () => {
  // Кадр, которому кодеку нечего сжимать (сплошная мелкая текстура),
  // в WebP может выйти тяжелее исходника. Геометрия при этом в пределах,
  // токенов мы не экономим — значит менять нечего.
  const grainy = await makePhotoLike(900, 900, 450);
  const result = await compressPhotoForAi(grainy);
  if (result !== null) {
    assert.ok(
      result.data.length < grainy.length,
      `отдали копию тяжелее оригинала: ${grainy.length} → ${result.data.length}`,
    );
  }
});

test("маленькое и лёгкое фото не трогаем: возвращаем null, а не пересжимаем без пользы", async () => {
  // Токены зрения считаются от числа пикселей, а не от байтов — если
  // геометрия в пределах и вес мал, перекодирование не сэкономит ничего,
  // а прозрачность или качество может испортить зря.
  const small = await makePng(640, 480);
  const result = await compressPhotoForAi(small);
  assert.equal(result, null);
});

test("апскейла нет: фото ровно на пороге не увеличивается и не пересжимается", async () => {
  const atLimit = await makePng(1024, 768);
  const result = await compressPhotoForAi(atLimit);
  assert.equal(result, null, "1024 по длинной стороне и лёгкий — трогать нечего");
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

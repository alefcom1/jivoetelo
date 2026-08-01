#!/usr/bin/env node
/**
 * Проверка детектора «в кадре еда» на настоящих фотографиях.
 *
 *     node scripts/food-probe.mjs снимок.jpg другой.png …
 *     node scripts/food-probe.mjs --dir каталог
 *
 * ## Зачем
 *
 * Порог в lib/food-presence.ts — это одно число, от которого зависит, будет
 * подсказка помогать или мешать. Подобрать его на глаз нельзя, а проверить
 * «работает ли вообще» — тем более: модель обучена на ImageNet, где нет ни
 * борща, ни гречки, и вполне могло оказаться, что на нашей еде она молчит.
 *
 * Скрипт печатает счёт по каждому файлу и три самых вероятных класса. По
 * ним видно не только «сработало / не сработало», но и почему: если борщ
 * опознан как consomme — это ожидаемо и правильно, если как «половая
 * тряпка» — порогом такое не лечится.
 *
 * Модель и рантайм берутся из public/models — те же файлы, что уходят в
 * браузер. Считать здесь другой копией значило бы проверять не то, что
 * работает у людей.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { foodScore, looksLikeFood, softmax, FOOD_THRESHOLD } from "../lib/food-presence.ts";

const MODEL = process.env.FOOD_MODEL ?? path.resolve("public/models/food/mobilenetv2-12-int8.onnx");
const LABELS = process.env.FOOD_LABELS ?? path.resolve("scripts/imagenet-labels.json");
const SIDE = 224;

// ImageNet-нормализация — та же, с которой модель обучалась. Своя дала бы
// сдвинутые вероятности и порог, подобранный не под ту картинку.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

const args = process.argv.slice(2);
const dirIndex = args.indexOf("--dir");
const files = dirIndex >= 0
  ? (await readdir(args[dirIndex + 1]))
      .filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
      .map((name) => path.join(args[dirIndex + 1], name))
  : args;

if (files.length === 0) {
  console.log("Укажите файлы или --dir каталог.");
  process.exit(1);
}

/** Кадр → тензор NCHW, как ждёт mobilenetv2 из onnx/models. */
async function toTensor(file) {
  const { data } = await sharp(await readFile(file))
    .resize(SIDE, SIDE, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = new Float32Array(3 * SIDE * SIDE);
  const plane = SIDE * SIDE;
  for (let i = 0, p = 0; i < plane; i++, p += 3) {
    out[i] = (data[p] / 255 - MEAN[0]) / STD[0];
    out[plane + i] = (data[p + 1] / 255 - MEAN[1]) / STD[1];
    out[2 * plane + i] = (data[p + 2] / 255 - MEAN[2]) / STD[2];
  }
  return out;
}

/**
 * Рантайм берётся оттуда, где оказался установлен, и в зависимостях проекта
 * не числится — как и Playwright в tests/e2e/browser.mjs, и по той же
 * причине: сто с лишним мегабайт в `npm ci` перед каждой сборкой ради
 * инструмента, который запускают раз в несколько месяцев, того не стоят.
 *
 *     npm install --no-save onnxruntime-web
 */
const CANDIDATES = [
  "onnxruntime-web",
  "/opt/node22/lib/node_modules/onnxruntime-web/dist/ort.node.min.mjs",
];
async function loadRuntime() {
  const problems = [];
  for (const candidate of CANDIDATES) {
    try {
      return await import(candidate);
    } catch (error) {
      problems.push(`${candidate}: ${error.code ?? error.message}`);
    }
  }
  throw new Error(`onnxruntime не найден. Установите: npm install --no-save onnxruntime-web\n${problems.join("\n")}`);
}

const ort = await loadRuntime();
// Свои же файлы из public/models: считать другой копией рантайма значило бы
// проверять не то, что работает у людей.
if (ort.env?.wasm) {
  ort.env.wasm.wasmPaths = path.resolve("public/models/ort") + path.sep;
  ort.env.wasm.numThreads = 1;
}
const session = await ort.InferenceSession.create(MODEL);
const labels = await readFile(LABELS, "utf8").then(JSON.parse).catch(() => null);

console.log(`Порог: ${FOOD_THRESHOLD}\n`);
for (const file of files) {
  let logits;
  try {
    const tensor = new ort.Tensor("float32", await toTensor(file), [1, 3, SIDE, SIDE]);
    const result = await session.run({ [session.inputNames[0]]: tensor });
    logits = result[session.outputNames[0]].data;
  } catch (error) {
    console.log(`${path.basename(file).padEnd(22)} не прочиталось: ${error.message}`);
    continue;
  }

  const probabilities = softmax(logits);
  const score = foodScore(probabilities);
  const top = [...probabilities]
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((t) => `${labels ? labels[t.index] : t.index} ${(t.value * 100).toFixed(0)}%`)
    .join(", ");

  console.log(
    `${path.basename(file).padEnd(22)} ${(score * 100).toFixed(1).padStart(6)}%  ` +
    `${looksLikeFood(probabilities) ? "еда " : "нет "}  ${top}`,
  );
}

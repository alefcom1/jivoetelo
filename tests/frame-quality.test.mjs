import assert from "node:assert/strict";
import { test } from "node:test";
import {
  frameDifference,
  frameStats,
  readiness,
  toGrayscale,
  MIN_SHARPNESS,
  STEADY_MOTION,
} from "../lib/frame-quality.ts";

/**
 * Метрики кадра проверяются на синтетике: настоящая фотография сюда не
 * годится вовсе — по ней нельзя сказать, каким число «должно» получиться,
 * и тест выродился бы в запись того, что вышло.
 *
 * Синтетика позволяет утверждать не значения, а свойства: шахматка резче
 * заливки, размытая шахматка — между ними, темнота остаётся темнотой.
 */

const W = 64;
const H = 48;

/** Равномерная заливка: границ нет вовсе. */
function flat(value) {
  return new Uint8ClampedArray(W * H).fill(value);
}

/** Шахматка с клеткой `cell`: чем мельче клетка, тем больше границ. */
function checker(cell, low = 20, high = 235) {
  const gray = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      gray[y * W + x] = dark ? low : high;
    }
  }
  return gray;
}

/** Усреднение по соседям — то же, что делает с кадром смазанная съёмка. */
function blur(gray, passes = 1) {
  let src = gray;
  for (let pass = 0; pass < passes; pass++) {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= H || nx < 0 || nx >= W) continue;
            sum += src[ny * W + nx];
            n++;
          }
        }
        out[y * W + x] = sum / n;
      }
    }
    src = out;
  }
  return src;
}

test("серый переводится по яркости, а не по одному каналу", () => {
  // Чистый зелёный ярче чистого синего — если бы брали любой один канал или
  // простое среднее, это различие пропало бы.
  const green = toGrayscale(new Uint8ClampedArray([0, 255, 0, 255]));
  const blue = toGrayscale(new Uint8ClampedArray([0, 0, 255, 255]));
  assert.ok(green[0] > blue[0], `зелёный ${green[0]} должен быть ярче синего ${blue[0]}`);
  const white = toGrayscale(new Uint8ClampedArray([255, 255, 255, 255]));
  assert.equal(white[0], 255);
});

test("у заливки резкости нет", () => {
  assert.equal(frameStats(flat(128), W, H).sharpness, 0);
});

test("чем больше границ, тем выше резкость", () => {
  const coarse = frameStats(checker(8), W, H).sharpness;
  const fine = frameStats(checker(2), W, H).sharpness;
  assert.ok(fine > coarse, `мелкая шахматка ${fine} должна быть резче крупной ${coarse}`);
});

test("размытие роняет резкость — это и есть смазанный кадр", () => {
  const sharp = frameStats(checker(4), W, H).sharpness;
  const smeared = frameStats(blur(checker(4), 2), W, H).sharpness;
  assert.ok(smeared < sharp / 4, `размытая ${smeared} против резкой ${sharp}`);
});

test("яркость и выбитость считаются честно", () => {
  assert.equal(Math.round(frameStats(flat(100), W, H).luma), 100);
  // Полностью белый кадр выбит целиком, серый — нисколько.
  assert.equal(frameStats(flat(255), W, H).clipped, 1);
  assert.equal(frameStats(flat(128), W, H).clipped, 0);
});

test("пустой кадр не роняет счёт делением на ноль", () => {
  const empty = frameStats(new Uint8ClampedArray(0), 0, 0);
  assert.equal(empty.sharpness, 0);
  assert.equal(empty.luma, 0);
  assert.equal(empty.clipped, 0);
});

test("неподвижная сцена даёт нулевое движение, смена кадра — заметное", () => {
  const a = checker(4);
  assert.equal(frameDifference(a, a), 0);
  const moved = frameDifference(a, checker(4, 235, 20));
  assert.ok(moved > 0.5, `инверсия должна дать большое различие, получили ${moved}`);
});

test("кадры разного размера считаются полностью различными", () => {
  // Сравнивать нечего — честнее вернуть максимум, чем тихо посчитать по
  // общей части и решить, что телефон замер.
  assert.equal(frameDifference(new Uint8ClampedArray(10), new Uint8ClampedArray(20)), 1);
});

test("готовность требует всех трёх условий сразу", () => {
  const good = { sharpness: MIN_SHARPNESS * 2, luma: 130, clipped: 0.02 };
  assert.ok(readiness(good, 0).ready);

  // Резкий и светлый, но телефон в движении.
  assert.ok(!readiness(good, STEADY_MOTION * 2).ready);
  // Неподвижный и светлый, но смазанный.
  assert.ok(!readiness({ ...good, sharpness: MIN_SHARPNESS / 2 }, 0).ready);
  // Неподвижный и резкий, но в темноте.
  assert.ok(!readiness({ ...good, luma: 10 }, 0).ready);
  // И отдельно — контровый свет: яркость средняя, но половина кадра выбита.
  assert.ok(!readiness({ ...good, clipped: 0.6 }, 0).ready);
});

test("готовность объясняет, чего именно не хватает", () => {
  // От этого зависит подсказка на экране: «держите ровнее» и «темновато» —
  // разные советы, и перепутать их значит отправить человека не туда.
  const dark = readiness({ sharpness: MIN_SHARPNESS * 2, luma: 10, clipped: 0 }, 0);
  assert.deepEqual(
    { steady: dark.steady, sharp: dark.sharp, lit: dark.lit },
    { steady: true, sharp: true, lit: false },
  );
});

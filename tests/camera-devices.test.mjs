import assert from "node:assert/strict";
import { test } from "node:test";
import { isVirtualCamera, preferredCamera, toCameraDevices } from "../lib/camera-devices.ts";

/**
 * Выбор камеры на ноутбуке.
 *
 * `getUserMedia` без указания устройства берёт умолчание системы, и это
 * регулярно оказывается виртуальная камера: человек открыл «Камеру», чтобы
 * снять тарелку, а увидел заставку OBS.
 */

const info = (deviceId, label, kind = "videoinput") => ({ deviceId, label, kind });

test("виртуальные камеры узнаются по названию", () => {
  assert.ok(isVirtualCamera("OBS Virtual Camera"));
  assert.ok(isVirtualCamera("Snap Camera"));
  assert.ok(isVirtualCamera("Reincubate Camo"));
  assert.ok(isVirtualCamera("Виртуальная камера"));
});

test("настоящие камеры за виртуальные не принимаются", () => {
  assert.ok(!isVirtualCamera("FaceTime HD Camera"));
  assert.ok(!isVirtualCamera("Встроенная камера"));
  assert.ok(!isVirtualCamera("back camera"));
  // «camo» проверяется как отдельное слово: иначе под правило попало бы всё,
  // где эти четыре буквы встретились внутри другого слова.
  assert.ok(!isVirtualCamera("Camorra HD Webcam"));
});

test("микрофоны в список камер не попадают", () => {
  const list = toCameraDevices([
    info("a", "FaceTime HD Camera"),
    info("b", "Встроенный микрофон", "audioinput"),
    info("c", "Наушники", "audiooutput"),
  ]);
  assert.deepEqual(list.map((d) => d.deviceId), ["a"]);
});

test("камера без названия остаётся в списке, но получает подпись", () => {
  // Названий нет до выдачи доступа, а иногда и после — у части устройств.
  // Выбросить такую камеру значило бы спрятать единственную настоящую.
  const list = toCameraDevices([info("a", ""), info("b", "")]);
  assert.equal(list.length, 2);
  assert.equal(list[0].label, "Камера 1");
  assert.equal(list[1].label, "Камера 2");
  assert.ok(list.every((d) => !d.virtual));
});

test("активна виртуальная, есть настоящая — предлагаем настоящую", () => {
  const list = toCameraDevices([
    info("obs", "OBS Virtual Camera"),
    info("mac", "FaceTime HD Camera"),
  ]);
  assert.equal(preferredCamera(list, "OBS Virtual Camera"), "mac");
});

test("активна настоящая — не трогаем ничего", () => {
  const list = toCameraDevices([
    info("obs", "OBS Virtual Camera"),
    info("mac", "FaceTime HD Camera"),
  ]);
  assert.equal(preferredCamera(list, "FaceTime HD Camera"), null);
});

test("виртуальная одна-единственная — оставляем её", () => {
  // Лучше заставка стрима, чем чёрный экран: другой камеры физически нет.
  const list = toCameraDevices([info("obs", "OBS Virtual Camera")]);
  assert.equal(preferredCamera(list, "OBS Virtual Camera"), null);
});

test("на телефоне с двумя камерами подмены не происходит", () => {
  const list = toCameraDevices([
    info("back", "camera2 0, facing back"),
    info("front", "camera2 1, facing front"),
  ]);
  assert.equal(preferredCamera(list, "camera2 0, facing back"), null);
});

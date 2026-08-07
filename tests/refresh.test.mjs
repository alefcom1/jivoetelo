import test from "node:test";
import assert from "node:assert/strict";
import { REFRESH_GAP_MS, shouldRefresh } from "../lib/refresh.ts";

/**
 * Обновление «Сегодня».
 *
 * Тесты написаны по живой жалобе: экран показывал вчерашние цифры, пока
 * приложение не закроешь и не откроешь заново. Причина — загрузка ровно один
 * раз при монтировании: переключение вкладок его не повторяет, а Telegram при
 * сворачивании webview не убивает.
 */

const BASE = { dataDay: "2026-08-05", today: "2026-08-05", lastLoadedAt: 1_000_000, now: 1_000_000 };

test("данных нет — грузим обычным порядком, с обработкой ошибок", () => {
  assert.equal(shouldRefresh({ ...BASE, dataDay: null }), "full");
});

test("щелчки по вкладкам туда-сюда не бьют по сети", () => {
  assert.equal(shouldRefresh({ ...BASE, now: BASE.lastLoadedAt + 1 }), "skip");
  assert.equal(shouldRefresh({ ...BASE, now: BASE.lastLoadedAt + REFRESH_GAP_MS - 1 }), "skip");
});

test("через порог обновляемся молча", () => {
  // Молча — потому что экран уже показан: ронять его в ошибку из-за одного
  // неудачного запроса нельзя.
  assert.equal(shouldRefresh({ ...BASE, now: BASE.lastLoadedAt + REFRESH_GAP_MS }), "silent");
  assert.equal(shouldRefresh({ ...BASE, now: BASE.lastLoadedAt + 60_000 }), "silent");
});

test("смена дня обновляет всегда, порог тут не действует", () => {
  // Вчерашние итоги под заголовком «сегодня» — это неверные данные, а не
  // устаревшие на десять секунд. Приложение, оставленное открытым на ночь,
  // обязано показать новый день сразу.
  const justLoaded = { ...BASE, dataDay: "2026-08-04", now: BASE.lastLoadedAt + 1 };
  assert.equal(shouldRefresh(justLoaded), "silent", "смену дня погасил порог");
});

test("данные из будущего тоже повод обновиться", () => {
  // Бывает при смене часового пояса в самолёте: на устройстве уже завтра, а
  // загружено сегодняшнее. Любое расхождение — повод сходить на сервер.
  assert.equal(shouldRefresh({ ...BASE, dataDay: "2026-08-06", now: BASE.lastLoadedAt + 1 }), "silent");
});

test("порог настраивается — на случай, если десять секунд окажутся не тем числом", () => {
  const at = { ...BASE, now: BASE.lastLoadedAt + 5_000 };
  assert.equal(shouldRefresh({ ...at, gapMs: 10_000 }), "skip");
  assert.equal(shouldRefresh({ ...at, gapMs: 1_000 }), "silent");
});

test("первый заход не считается свежим из-за нулевого времени загрузки", () => {
  // lastLoadedAt = 0 и данных нет — это старт приложения, а не «только что
  // обновлялись в 1970 году».
  assert.equal(shouldRefresh({ dataDay: null, today: "2026-08-05", lastLoadedAt: 0, now: 1_000_000 }), "full");
});

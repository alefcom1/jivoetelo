import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { retriesFor, timeoutFor, worstCaseMs } from "../lib/ai/client.ts";

/**
 * Согласованность пределов ожидания между приложением и nginx.
 *
 * ## Зачем такой странный тест
 *
 * Разбор фото перестал работать из-за расхождения двух чисел в двух разных
 * файлах. Приложение было готово ждать модель до 240 секунд (120 плюс
 * повторная попытка), nginx ждал приложение 120 — и обрывал соединение ровно
 * тогда, когда шла вторая попытка. Молча, пятьсот четвёртой, без единой
 * строки в нашем логе.
 *
 * Глазами это не видно: числа выглядят одинаковыми и потому — согласованными.
 * Поэтому конфигурация nginx здесь именно читается с диска и сравнивается с
 * тем, что делает код.
 */

const OPERATIONS = ["analyze_photo", "analyze_text", "suggest"];

/** Терпение nginx — из того же файла, который уезжает на сервер. */
function nginxReadTimeoutMs() {
  const conf = readFileSync("deploy/nginx/jivoetelo-proxy.conf", "utf8");
  const match = conf.match(/^\s*proxy_read_timeout\s+(\d+)s;/m);
  assert.ok(match, "в конфигурации nginx не нашёлся proxy_read_timeout");
  return Number(match[1]) * 1000;
}

test("приложение сдаётся раньше, чем nginx обрывает связь", () => {
  const nginx = nginxReadTimeoutMs();
  for (const operation of OPERATIONS) {
    assert.ok(
      worstCaseMs(operation) < nginx,
      `${operation}: приложение готово ждать ${worstCaseMs(operation)} мс при терпении nginx ${nginx} мс — ` +
      "nginx оборвёт соединение первым, и в логе не останется ничего",
    );
  }
});

test("у долгих операций нет повторных попыток", () => {
  // Повтор защищает от случайного обрыва связи. Двухминутный запрос
  // обрывается не случайно — он просто долгий, и вторая попытка лишь
  // удваивает ожидание, упираясь в терпение nginx.
  assert.equal(retriesFor("analyze_photo"), 0);
  // Коротким он по-прежнему полезен: обрыв на пути к прокси случается.
  assert.ok(retriesFor("analyze_text") >= 1);
});

test("худший случай считается вместе с повторами, а не по одному пределу", () => {
  // Именно эта арифметика и была упущена: смотрели на timeout, забывая, что
  // попыток две.
  for (const operation of OPERATIONS) {
    assert.equal(worstCaseMs(operation), timeoutFor(operation) * (retriesFor(operation) + 1), operation);
  }
});

test("запас между приложением и nginx не символический", () => {
  // Впритык — то же самое, что расхождение: любое дрожание сети съест зазор.
  const nginx = nginxReadTimeoutMs();
  const slowest = Math.max(...OPERATIONS.map(worstCaseMs));
  assert.ok(nginx - slowest >= 30_000, `запас всего ${nginx - slowest} мс`);
});

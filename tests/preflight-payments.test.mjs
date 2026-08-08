import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Проверка приёма оплаты перед выкаткой (`scripts/preflight.mjs`).
 *
 * Заведено по факту, а не из осторожности. Проверка спрашивала про ключи
 * Unitpay, а оплата к тому времени переехала на Tribute; когда на сервере
 * выставили `PAYMENTS_ENABLED=true`, четыре выкатки подряд остановились на
 * «ключи Unitpay не заданы» — при полностью рабочем приёме денег. Снаружи это
 * выглядело как «обновления не доезжают до сайта», и найти причину можно было
 * только в логе GitHub Actions.
 *
 * Опаснее самой поломки её направление: проверка перед выкаткой — единственное
 * место, где ошибка не ломает бой, а **не пускает в бой исправления**. Молчать
 * она умеет ровно в ту сторону, где этого меньше всего ждёшь.
 *
 * Поэтому проверяем не «скрипт отработал», а какое именно решение он принял по
 * каждому сочетанию провайдеров. Логика обязана совпадать с `paymentsEnabled()`
 * в `lib/payments/config.ts` — там она единственная настоящая.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "preflight.mjs");

const TRIBUTE = {
  TRIBUTE_API_KEY: "70e2f956",
  TRIBUTE_LINK_MONTH: "https://web.tribute.tg/p/Bw2",
  TRIBUTE_LINK_YEAR: "https://web.tribute.tg/p/Bw4",
};
const UNITPAY = { UNITPAY_PUBLIC_KEY: "pub", UNITPAY_SECRET_KEY: "sec" };

/**
 * Запускает проверку в пустом каталоге со своим `.env`.
 *
 * Каталог нужен затем, что скрипт читает `.env` рядом с собой и **значения из
 * окружения перекрывают файл**. Без подмены каталога проверка читала бы боевые
 * ключи разработчика, и тест то проходил бы, то нет — в зависимости от того,
 * чей это компьютер.
 */
function preflight(vars) {
  const dir = mkdtempSync(path.join(tmpdir(), "preflight-"));
  writeFileSync(path.join(dir, ".env"), "");
  const script = path.join(dir, "preflight.mjs");
  writeFileSync(script, `export * from ${JSON.stringify(SCRIPT)};\n`);
  try {
    return execFileSync(process.execPath, [script], {
      // `env` целиком, а не поверх process.env: иначе ключи из окружения
      // разработчика доедут до проверки и подтвердят то, чего в тесте нет.
      env: { PATH: process.env.PATH, ...vars },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // Проверка выходит с кодом 1, когда нашла проблемы, — это ожидаемый исход
    // половины случаев здесь, а не сбой запуска.
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}

test("включённая оплата с ключами Tribute выкатку не останавливает", () => {
  const out = preflight({ PAYMENTS_ENABLED: "true", ...TRIBUTE });
  assert.match(out, /Приём оплаты включён: Tribute/);
  assert.doesNotMatch(out, /FAIL.*оплат/i, "Tribute настроен, останавливать выкатку не за что");
});

test("включённая оплата с ключами Unitpay тоже проходит", () => {
  const out = preflight({ PAYMENTS_ENABLED: "true", ...UNITPAY });
  assert.match(out, /Приём оплаты включён: Unitpay/);
  assert.doesNotMatch(out, /FAIL.*оплат/i);
});

test("включённая оплата без единого провайдера — останов, и это правильно", () => {
  const out = preflight({ PAYMENTS_ENABLED: "true" });
  assert.match(out, /FAIL.*ни один провайдер не настроен/);
  // Сообщение обязано называть оба пути: человек, читающий его в логе
  // Actions, до кода не дойдёт, а решение принимать ему.
  assert.match(out, /TRIBUTE_API_KEY/);
  assert.match(out, /UNITPAY_PUBLIC_KEY/);
});

test("ключи без выключателя — не проблема, но и не молчание", () => {
  const out = preflight(TRIBUTE);
  assert.match(out, /PAYMENTS_ENABLED не выставлен/);
  assert.doesNotMatch(out, /FAIL.*оплат/i, "промежуточное состояние — рабочий режим проверки связи");
});

test("ни ключей, ни выключателя — тишина без придирок", () => {
  const out = preflight({});
  assert.match(out, /Приём оплаты выключен/);
  assert.doesNotMatch(out, /FAIL.*оплат/i);
});

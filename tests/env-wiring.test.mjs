import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Переменные окружения доходят до контейнера.
 *
 * Заведено после настоящего промаха: `SPEECH_URL` описали в `.env.example`,
 * а пробросить в `docker-compose.yml` забыли. Снаружи это выглядит как
 * «расшифровка не включается», хотя в `.env` всё написано верно, — и
 * отлаживать такое приходится на боевом сервере, потому что локально
 * приложение читает `.env` напрямую и работает.
 *
 * Проверка тупая нарочно: пересечение двух списков. Сложнее и не нужно —
 * дефект ровно в том, что один список забыли обновить вслед за другим.
 */

const EXAMPLE = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const COMPOSE = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");

/** Имена переменных из .env.example — строки вида «NAME=» в начале строки. */
function declared() {
  return [...EXAMPLE.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
}

/**
 * Что compose не передаёт приложению и не должен.
 *
 * POSTGRES_PASSWORD и DATABASE_URL живут в самом compose: пароль уходит в
 * контейнер базы, а строку подключения приложение получает собранной из него
 * же — с хостом `db`, а не `localhost`, как в примере для разработки.
 *
 * APP_HOST_PORT — это порт публикации на хосте, он используется в `ports:`,
 * а не внутри контейнера.
 *
 * UPLOADS_DIR compose задаёт сам и фиксированным значением: внутри контейнера
 * это всегда /app/data/uploads, куда примонтирован том. Переменная в примере
 * нужна для разработки, где каталог свой.
 */
const NOT_FOR_APP = new Set(["POSTGRES_PASSWORD", "DATABASE_URL", "APP_HOST_PORT", "UPLOADS_DIR"]);

test("каждая переменная из .env.example доходит до контейнера", () => {
  const missing = declared().filter((name) => !NOT_FOR_APP.has(name) && !COMPOSE.includes(`\${${name}`));
  assert.deepEqual(
    missing,
    [],
    `в .env.example есть, а в docker-compose.yml не пробрасывается: ${missing.join(", ")}. ` +
      "На сервере это выглядит как «переменную задали, а она не действует».",
  );
});

test("compose не ждёт того, чего нет в примере", () => {
  // Обратная сторона того же расхождения: переменная, о которой знает только
  // compose, никогда не будет заполнена — про неё неоткуда узнать.
  const known = new Set(declared());
  const extra = [...COMPOSE.matchAll(/\$\{([A-Z][A-Z0-9_]*)[:}]/g)]
    .map((m) => m[1])
    .filter((name) => !known.has(name));
  assert.deepEqual([...new Set(extra)], [], "есть в docker-compose.yml, но не описано в .env.example");
});

test("речь описана целиком", () => {
  // Три переменные работают только вместе: адрес, токен и режим. Забытая
  // третья означает, что заглушку невозможно ни включить, ни выключить.
  for (const name of ["SPEECH_URL", "SPEECH_TOKEN", "SPEECH_PROVIDER"]) {
    assert.ok(EXAMPLE.includes(`${name}=`), `${name} не описан в .env.example`);
    assert.ok(COMPOSE.includes(`\${${name}`), `${name} не пробрасывается в контейнер`);
  }
});

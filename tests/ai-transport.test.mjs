import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { Agent } from "undici";
import { upstreamFetch } from "../lib/ai/client.ts";

/**
 * Транспорт до модели — то место, где ошибка не выглядит ошибкой.
 *
 * Обращения к Anthropic шли через агента undici, отданного глобальному
 * `fetch`. Способ официальный, но undici в системе два: встроенный в Node
 * (шестой) и установленный пакетом (восьмой). Обработчик запроса у них
 * разный, встроенный fetch собирал его по-старому, а наш агент проверял
 * по-новому — и отказывал ещё до открытия сокета.
 *
 * Наружу это выглядело как `Error: Connection error` со `status: undefined`,
 * то есть как проблема сети. В интерфейсе — «Не получилось подобрать
 * варианты, попробуйте через минуту», что предлагало подождать там, где
 * ждать было бесполезно: не уходил ни один запрос.
 *
 * Тест поднимает свой сервер: ни сети, ни ключей не нужно, а проверяется
 * ровно то, что ломалось, — доходит ли запрос до сокета вообще.
 */

let server;
let base;

before(async () => {
  server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, method: request.method }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("транспорт до модели доходит до сокета", async () => {
  const response = await upstreamFetch(`${base}/v1/messages`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, method: "GET" });
});

test("тело и заголовки доезжают", async () => {
  // POST — то, чем ходит SDK; если бы транспорт разваливался только на теле,
  // проверка одним GET этого не заметила бы.
  const response = await upstreamFetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-probe": "1" },
    body: JSON.stringify({ hello: "мир" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, method: "POST" });
});

test("агент undici, отданный глобальному fetch, не работает", async () => {
  // Проверка на будущее: она фиксирует, ПОЧЕМУ транспорт написан именно так.
  // Если однажды Node и пакет сойдутся в одной версии undici, тест упадёт —
  // и это будет поводом упростить lib/ai/client.ts, а не молча жить дальше
  // с обходным путём, смысл которого забыт.
  const agent = new Agent({ pipelining: 0, keepAliveTimeout: 1 });
  await assert.rejects(
    () => fetch(`${base}/v1/messages`, { dispatcher: agent }),
    (error) => {
      assert.match(String(error.cause?.message ?? error.message), /onRequestStart|handler/i);
      return true;
    },
    "глобальный fetch внезапно подружился с внешним агентом — проверьте версии undici",
  );
});

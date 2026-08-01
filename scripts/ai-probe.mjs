#!/usr/bin/env node
/**
 * Где именно встаёт разбор фото.
 *
 *     docker compose cp scripts/ai-probe.mjs app:/tmp/ai-probe.mjs
 *     docker compose exec app node /tmp/ai-probe.mjs
 *
 * ## Зачем отдельный скрипт
 *
 * Разбор фото чинили трижды и трижды не то: сперва общий предел ожидания,
 * потом рассогласование с nginx, потом раздумья модели. Каждый раз починка
 * опиралась на рассуждение, а не на замер, — потому что замерить было нечем:
 * приложение отвечает «не получилось разобрать», и всё.
 *
 * ## Что уже известно
 *
 * Первый прогон разложил цепочку по составляющим и показал: текст проходит
 * за секунду, картинка 64×64 — за две, а настоящий снимок висит минутами.
 * Второй добавил развёртку по весу тела и снял последнюю неясность:
 *
 *     3.    картинка 64×64, тело ~1 КБ    ок за 2,4 с
 *     3.16  та же картинка, тело ~22 КБ   ок за 2,7 с
 *     3.64  та же картинка, тело ~87 КБ   ОБРЫВ за 153 с
 *
 * Картинка во всех трёх одна. Значит дело не в снимке, не в пикселях и не в
 * модели, а в весе запроса: где-то на пути его перестают пропускать.
 *
 * ## Что выясняет этот прогон
 *
 * Путь до модели такой:
 *
 *     приложение (VPS в России)
 *       → Caddy на Hetzner (proxy.techperevod.com)
 *         → techperevod-worker
 *           → api.anthropic.com
 *
 * Два вопроса, на которые здесь есть ответ:
 *
 *  1. ГДЕ порог. Развёртка мельче — 16, 24, 32, 48, 64 КБ, — чтобы увидеть
 *     не «между 22 и 87», а конкретное число. По нему уже видно природу:
 *     ровно 64 КБ — буфер сокета, плавная деградация — сеть.
 *
 *  2. ЧЕЙ порог. Тот же вес уходит ещё в два места: на сам прокси с заведомо
 *     негодным секретом (доедет ли столько байт до Hetzner вообще) и на
 *     посторонний хост (может ли этот VPS вообще отправить такой запрос
 *     наружу). Дальше уже некуда гадать:
 *       - посторонний хост тоже встал  → канал наружу, ничем в коде не лечится;
 *       - прокси отвечает, Anthropic нет → воркер или его связь с Anthropic;
 *       - прокси тоже встал             → участок Россия → Hetzner или Caddy.
 *
 * Ничего не импортируется из node_modules: только глобальный fetch и
 * встроенные модули. Скрипт должен запускаться в любом контейнере, каким бы
 * урезанным ни оказался его node_modules, — и не зависеть от того самого
 * кода, который мы проверяем.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
const TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const UPLOADS = process.env.UPLOADS_DIR || "/app/data/uploads";
const VISION = process.env.ANTHROPIC_MODEL_VISION || process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const TEXT = process.env.ANTHROPIC_MODEL_TEXT || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

/**
 * Сколько ждём обычный шаг и сколько — шаг развёртки.
 *
 * У обычного предел щедрый: надо увидеть, сколько на самом деле нужно, а не
 * упереться в собственную настройку. У развёртки — жёсткий: шагов много, и
 * если каждый висящий будет отниматься по три минуты, прогон не кончится
 * никогда. Для развёртки важен сам факт «встал», а не точное время.
 */
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 180_000);
const SWEEP_TIMEOUT_MS = Number(process.env.PROBE_SWEEP_TIMEOUT_MS || 45_000);

if (!TOKEN && !API_KEY) {
  console.log("Ни ANTHROPIC_AUTH_TOKEN, ни ANTHROPIC_API_KEY не заданы — проверять нечего.");
  process.exit(1);
}

console.log(`Прокси:  ${BASE}`);
console.log(`Зрение:  ${VISION}`);
console.log(`Текст:   ${TEXT}`);
console.log(`Предел:  ${Math.round(TIMEOUT_MS / 1000)} с на шаг, ${Math.round(SWEEP_TIMEOUT_MS / 1000)} с на развёртке\n`);

/** Крошечный JPEG-квадрат 64×64 — минимальная картинка, какую примет модель. */
const TINY_JPEG =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
  "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABAAEABAREA/8QAHwAAAQUBAQEB" +
  "AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh" +
  "ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ" +
  "WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG" +
  "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiiv/9k=";

/** Настоящий снимок еды из хранилища — то, на чём всё и падает. */
async function realPhoto() {
  try {
    const users = await readdir(UPLOADS);
    for (const user of users) {
      const dir = path.join(UPLOADS, user);
      if (!(await stat(dir)).isDirectory()) continue;
      const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
      if (files.length === 0) continue;
      const file = path.join(dir, files[files.length - 1]);
      const data = await readFile(file);
      return { base64: data.toString("base64"), bytes: data.length, name: file };
    }
  } catch {
    // Каталога нет или он пуст — шаг просто пропустится.
  }
  return null;
}

function authHeaders() {
  return TOKEN
    ? { authorization: `Bearer ${TOKEN}` }
    : { "x-api-key": API_KEY };
}

const kb = (bytes) => `${Math.round(bytes / 1024)} КБ`;

/**
 * Один шаг: посылаем тело, засекаем время, печатаем итог.
 *
 * Вес тела печатается всегда — он здесь главная переменная, и держать его
 * в уме по номеру шага неудобно. `connection: close` не даёт шагам делить
 * один сокет: иначе непонятно, встал ли запрос сам по себе или ему достался
 * сокет, испорченный предыдущим.
 */
async function probe(label, { url = `${BASE}/v1/messages?beta=true`, headers, body, timeoutMs = TIMEOUT_MS, expect }) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const started = Date.now();
  process.stdout.write(`${label.padEnd(38)}${kb(Buffer.byteLength(payload)).padStart(8)}  `);
  const merged = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
    connection: "close",
    ...authHeaders(),
    ...headers,
  };
  // undefined в значении заголовка fetch превращает в строку "undefined" —
  // так посторонний хост получил бы мусорную авторизацию вместо никакой.
  for (const [name, value] of Object.entries(merged)) {
    if (value === undefined) delete merged[name];
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: merged,
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const text = await response.text();
    if (expect) {
      // Контрольный шаг: важен не разбор еды, а сам факт «столько байт
      // доехало и хост успел ответить». Любой ответ здесь — успех.
      console.log(`ДОЕХАЛО за ${seconds} с (ответ ${response.status})`);
      return true;
    }
    if (!response.ok) {
      console.log(`ОТКАЗ ${response.status} за ${seconds} с — ${text.slice(0, 220).replace(/\s+/g, " ")}`);
      return false;
    }
    const json = JSON.parse(text);
    console.log(`ок за ${seconds} с (вышло ${json.usage?.output_tokens ?? "?"} токенов, стоп: ${json.stop_reason ?? "?"})`);
    return true;
  } catch (error) {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const kind = error?.name === "TimeoutError" ? "НЕ ДОЖДАЛИСЬ" : "ОБРЫВ";
    console.log(`${kind} за ${seconds} с — ${error?.message ?? error}`);
    return false;
  }
}

/** Схема ответа — ровно та, что шлёт разбор еды. Форма важна, поля нет. */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "grams"],
        properties: { name: { type: "string" }, grams: { type: "number" } },
      },
    },
  },
};

const image = (base64) => ({
  role: "user",
  content: [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
    { type: "text", text: "Что за еда на снимке? Ответь одним предложением." },
  ],
});

/**
 * Тот же крошечный кадр, но раздутый до нужного числа байт.
 *
 * Надо развести две вещи, которые в обычном снимке слиты: сколько в запросе
 * БАЙТ и сколько в нём ПИКСЕЛЕЙ. Модель считает работу по пикселям, а сеть и
 * прокси — по байтам, и если запрос с настоящим снимком виснет, а с
 * крошечным проходит, виноват может быть кто угодно из двоих.
 *
 * Приписка после маркера конца JPEG (FFD9) декодерами игнорируется: картинка
 * остаётся 64×64 и стоит модели те же копейки, а тело запроса вырастает до
 * заданного размера.
 */
function paddedImage(kilobytes) {
  const raw = Buffer.from(TINY_JPEG, "base64");
  const padding = Buffer.alloc(Math.max(0, kilobytes * 1024 - raw.length), 0x20);
  return Buffer.concat([raw, padding]).toString("base64");
}

/** Балласт для контрольных шагов — там содержимое не важно, важен вес. */
function ballast(kilobytes) {
  return JSON.stringify({ filler: "x".repeat(kilobytes * 1024) });
}

const photo = await realPhoto();
if (photo) console.log(`Снимок для проверки: ${photo.name} (${kb(photo.bytes)})\n`);
else console.log(`Настоящих снимков в ${UPLOADS} не нашлось — шаги 4–6 пропускаются.\n`);

console.log("ЧАСТЬ 1. Цепочка разбора: что добавляет каждый следующий шаг\n");

const chain = [
  ["1. текст на haiku", {
    body: { model: TEXT, max_tokens: 100, messages: [{ role: "user", content: "Ответь одним словом: работает?" }] },
  }],
  ["2. текст на sonnet", {
    body: { model: VISION, max_tokens: 100, messages: [{ role: "user", content: "Ответь одним словом: работает?" }] },
  }],
  ["3. картинка 64×64", {
    body: { model: VISION, max_tokens: 200, messages: [image(TINY_JPEG)] },
  }],
];

// Развёртка по весу: картинка везде одна, 64×64. Меняется только вес тела.
for (const size of [16, 24, 32, 48, 64]) {
  chain.push([`3.${size}. та же картинка, балласт ${size} КБ`, {
    body: { model: VISION, max_tokens: 200, messages: [image(paddedImage(size))] },
    timeoutMs: SWEEP_TIMEOUT_MS,
  }]);
}

if (photo) {
  chain.push(
    ["4. настоящий снимок", {
      body: { model: VISION, max_tokens: 200, messages: [image(photo.base64)] },
    }],
    ["5. + структурированный JSON", {
      body: {
        model: VISION, max_tokens: 4000,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [image(photo.base64)],
      },
    }],
    ["6. + раздумья (как было до починки)", {
      body: {
        model: VISION, max_tokens: 16000,
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        messages: [image(photo.base64)],
      },
    }],
  );
}

let firstFailure = null;
for (const [label, options] of chain) {
  const ok = await probe(label, options);
  if (!ok && !firstFailure) firstFailure = label;
}

/**
 * Часть 2 нужна только если вес действительно мешает. Если вся цепочка
 * прошла — проверять, кто давится весом, нечего.
 */
if (firstFailure) {
  console.log("\nЧАСТЬ 2. Тот же вес, но другие адресаты: чей это порог\n");

  const HEAVY_KB = Number(process.env.PROBE_HEAVY_KB || 64);
  const origin = new URL(BASE).origin;

  await probe("2a. прокси, негодный секрет", {
    url: `${origin}/api/v1/messages`,
    headers: { authorization: "Bearer probe-invalid-secret" },
    body: ballast(HEAVY_KB),
    timeoutMs: SWEEP_TIMEOUT_MS,
    // Ждём быстрый 403 от воркера. Он и есть ответ: столько байт доехало
    // до Hetzner, Caddy их принял, воркер успел ответить.
    expect: true,
  });

  for (const host of ["https://httpbin.org/post", "https://postman-echo.com/post"]) {
    await probe(`2b. посторонний хост ${new URL(host).hostname}`, {
      url: host,
      headers: { authorization: undefined },
      body: ballast(HEAVY_KB),
      timeoutMs: SWEEP_TIMEOUT_MS,
      // Проверяем сам VPS: может ли он вообще отправить наружу столько
      // байт. Если и здесь тишина — дело не в нашем прокси и не в коде.
      expect: true,
    });
  }
}

console.log("");
if (!firstFailure) {
  console.log("Все шаги прошли. Значит дело не в модели и не в прокси —");
  console.log("смотрите на приложение: пределы ожидания, nginx, квоты.");
} else {
  console.log(`Первым упал шаг: ${firstFailure}\n`);
  console.log("Как читать:");
  console.log("  1   — не работает прокси или ключ;");
  console.log("  2   — недоступна модель зрения (проверьте ANTHROPIC_MODEL_VISION);");
  console.log("  3   — прокси не пропускает картинки вовсе;");
  console.log("  3.N — дело в ВЕСЕ тела, а не в снимке: картинка везде одна, 64×64.");
  console.log("        Номер шага, на котором встало, и есть порог;");
  console.log("  4   — дело именно в снимке (пиксели), а не в весе;");
  console.log("  5   — дело в схеме ответа;");
  console.log("  6   — дело в раздумьях (effort) — это мы уже убрали.");
  console.log("");
  console.log("Часть 2 говорит, чей порог:");
  console.log("  2b встал тоже        → канал наружу у этого VPS. В коде не лечится;");
  console.log("  2a доехал, 3.N нет   → воркер или его связь с Anthropic;");
  console.log("  2a встал, 2b доехал  → участок Россия → Hetzner или сам Caddy.");
}

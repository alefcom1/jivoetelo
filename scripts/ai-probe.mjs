#!/usr/bin/env node
/**
 * Где именно встаёт разбор фото.
 *
 *     docker compose exec app node scripts/ai-probe.mjs
 *
 * ## Зачем отдельный скрипт
 *
 * Разбор фото чинили трижды и трижды не то: сперва общий предел ожидания,
 * потом рассогласование с nginx, потом раздумья модели. Каждый раз починка
 * опиралась на рассуждение, а не на замер, — потому что замерить было нечем:
 * приложение отвечает «не получилось разобрать», и всё.
 *
 * Здесь цепочка разбирается по шагам. Каждый следующий добавляет ровно одну
 * составляющую к предыдущему, и первый упавший показывает виновника:
 *
 *   1. текст на haiku          — живы ли прокси и ключ вообще
 *   2. текст на sonnet         — доступна ли модель зрения
 *   3. картинка 64×64          — работает ли зрение как таковое
 *   4. настоящий снимок        — дело в размере картинки?
 *   5. + структурированный JSON — дело в схеме ответа?
 *   6. + раздумья              — дело в effort? (так было до починки)
 *
 * Ничего не импортируется: только глобальный fetch. Скрипт должен запускаться
 * в любом контейнере, каким бы урезанным ни оказался его node_modules, — и не
 * зависеть от того самого кода, который мы проверяем.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
const TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const UPLOADS = process.env.UPLOADS_DIR || "/app/data/uploads";
const VISION = process.env.ANTHROPIC_MODEL_VISION || process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const TEXT = process.env.ANTHROPIC_MODEL_TEXT || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
/** Столько ждём каждый шаг. Больше нашего боевого предела — чтобы увидеть,
 *  сколько на самом деле нужно, а не упереться в собственную настройку. */
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 180_000);

if (!TOKEN && !API_KEY) {
  console.log("Ни ANTHROPIC_AUTH_TOKEN, ни ANTHROPIC_API_KEY не заданы — проверять нечего.");
  process.exit(1);
}

console.log(`Прокси:  ${BASE}`);
console.log(`Зрение:  ${VISION}`);
console.log(`Текст:   ${TEXT}`);
console.log(`Предел:  ${Math.round(TIMEOUT_MS / 1000)} с на шаг\n`);

/** Однопиксельный JPEG-квадрат — минимальная картинка, какую примет модель. */
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

/** Один шаг: посылаем тело, засекаем время, печатаем итог. */
async function probe(label, body) {
  const started = Date.now();
  process.stdout.write(`${label.padEnd(46)}`);
  try {
    const response = await fetch(`${BASE}/v1/messages?beta=true`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        ...authHeaders(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!response.ok) {
      const text = (await response.text()).slice(0, 300).replace(/\s+/g, " ");
      console.log(`ОТКАЗ ${response.status} за ${seconds} с — ${text}`);
      return false;
    }
    const json = await response.json();
    const out = json.usage?.output_tokens ?? "?";
    const stop = json.stop_reason ?? "?";
    console.log(`ок за ${seconds} с (вышло ${out} токенов, стоп: ${stop})`);
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

const photo = await realPhoto();
if (photo) console.log(`Снимок для проверки: ${photo.name} (${Math.round(photo.bytes / 1024)} КБ)\n`);
else console.log(`Настоящих снимков в ${UPLOADS} не нашлось — шаги 4–6 пропускаются.\n`);

const steps = [
  ["1. текст на haiku", {
    model: TEXT, max_tokens: 100,
    messages: [{ role: "user", content: "Ответь одним словом: работает?" }],
  }],
  ["2. текст на sonnet", {
    model: VISION, max_tokens: 100,
    messages: [{ role: "user", content: "Ответь одним словом: работает?" }],
  }],
  ["3. картинка 64×64 на sonnet", {
    model: VISION, max_tokens: 200, messages: [image(TINY_JPEG)],
  }],
];

if (photo) {
  steps.push(
    ["4. настоящий снимок", {
      model: VISION, max_tokens: 200, messages: [image(photo.base64)],
    }],
    ["5. + структурированный JSON", {
      model: VISION, max_tokens: 4000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [image(photo.base64)],
    }],
    ["6. + раздумья (как было до починки)", {
      model: VISION, max_tokens: 16000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [image(photo.base64)],
    }],
  );
}

let firstFailure = null;
for (const [label, body] of steps) {
  const ok = await probe(label, body);
  if (!ok && !firstFailure) firstFailure = label;
}

console.log("");
if (!firstFailure) {
  console.log("Все шаги прошли. Значит дело не в модели и не в прокси —");
  console.log("смотрите на приложение: пределы ожидания, nginx, квоты.");
} else {
  console.log(`Первым упал шаг: ${firstFailure}`);
  console.log("Он и добавил ту составляющую, из-за которой всё встаёт:");
  console.log("  1 — не работает прокси или ключ;");
  console.log("  2 — недоступна модель зрения (проверьте ANTHROPIC_MODEL_VISION);");
  console.log("  3 — прокси не пропускает картинки;");
  console.log("  4 — дело в размере снимка;");
  console.log("  5 — дело в схеме ответа;");
  console.log("  6 — дело в раздумьях (effort) — это мы уже убрали.");
}

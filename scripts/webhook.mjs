#!/usr/bin/env node
/**
 * Вебхук бота: посмотреть, зарегистрировать, снять.
 *
 *   node scripts/webhook.mjs         # показать состояние (ничего не меняет)
 *   node scripts/webhook.mjs set     # зарегистрировать вебхук и команды
 *   node scripts/webhook.mjs delete  # снять вебхук
 *
 * Раньше это была команда curl в инструкции, и она била мимо дважды. Во-первых,
 * с российского VPS `api.telegram.org` не отвечает — адрес нужно брать из
 * `TELEGRAM_API_BASE` и добавлять заголовок авторизации прокси, ровно как это
 * делает `lib/telegram-api.ts`. Во-вторых, значения из `.env` в инструкции
 * читались через `grep -m1`, то есть первым вхождением, — а docker compose
 * берёт последнее. При дубликате ключа вебхук регистрировался с одним
 * секретом, а приложение проверяло другой, и Telegram отвечал 403.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const env = readEnv(resolve(root, ".env"));

const command = (process.argv[2] ?? "info").toLowerCase();
if (!["info", "set", "delete"].includes(command)) {
  console.log("Использование: node scripts/webhook.mjs [info|set|delete]");
  process.exit(2);
}

const token = value("TELEGRAM_BOT_TOKEN");
const secret = value("TELEGRAM_WEBHOOK_SECRET");
const siteUrl = value("SITE_URL").replace(/\/+$/, "");
const apiBase = (value("TELEGRAM_API_BASE") || "https://api.telegram.org").replace(/\/+$/, "");
const apiAuth = value("TELEGRAM_API_AUTH");

if (!token) die("TELEGRAM_BOT_TOKEN не задан в .env — токен выдаёт @BotFather.");
if (command === "set") {
  if (!secret) die("TELEGRAM_WEBHOOK_SECRET не задан. Сгенерируйте: openssl rand -hex 32");
  if (secret.length < 24) die("TELEGRAM_WEBHOOK_SECRET короче 24 символов — сгенерируйте новый.");
  if (!/^https:\/\//.test(siteUrl)) die(`SITE_URL должен быть https-адресом, сейчас: ${siteUrl || "пусто"}`);
}

console.log(`Bot API: ${apiBase}${apiAuth ? " (через прокси, с авторизацией)" : ""}`);
console.log(`Токен:   ${mask(token)}`);

if (command === "set") {
  const webhookUrl = `${siteUrl}/api/tg/webhook`;
  await call("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  console.log(`  ok   вебхук зарегистрирован: ${webhookUrl}`);

  await call("setMyCommands", {
    commands: [
      { command: "start", description: "Как всё устроено" },
      { command: "stop", description: "Выключить напоминания" },
    ],
  });
  console.log("  ok   команды бота заданы.");
} else if (command === "delete") {
  await call("deleteWebhook", { drop_pending_updates: false });
  console.log("  ok   вебхук снят. Бот больше не получает апдейты.");
}

const info = await call("getWebhookInfo", {});
console.log("");
console.log(`URL:              ${info.url || "— (не задан)"}`);
console.log(`Ожидают доставки: ${info.pending_update_count ?? 0}`);

if (info.last_error_message) {
  console.log(`Последняя ошибка: ${info.last_error_message}`);
  console.log(`  FAIL ${explain(info.last_error_message)}`);
  process.exit(1);
}

if (command !== "delete" && !info.url) {
  console.log("  warn Вебхук не зарегистрирован — бот не получит ни одного сообщения.");
  console.log("       Зарегистрировать: node scripts/webhook.mjs set");
  process.exit(1);
}

if (command !== "delete") console.log("  ok   Ошибок доставки нет.");

/**
 * Ответ Telegram на неудачу — одна строка текста, и по ней почти всегда видно,
 * что именно чинить. Пересказываем её действием, а не кодом ошибки.
 */
function explain(message) {
  if (/503/.test(message)) return "На сервере пуст TELEGRAM_WEBHOOK_SECRET — маршрут вебхука отвечает 503. Задайте секрет и перезапустите приложение.";
  if (/403/.test(message)) return "Секрет в приложении и секрет вебхука разные. Перерегистрируйте: node scripts/webhook.mjs set";
  if (/404/.test(message)) return "Приложение не отдаёт /api/tg/webhook — проверьте, что за SITE_URL стоит именно оно (curl -I $SITE_URL).";
  if (/[Ss][Ss][Ll]|certificate/.test(message)) return "Проблема с сертификатом домена. Telegram требует валидный TLS.";
  if (/[Tt]imeout|unreachable|[Cc]onnection/.test(message)) return "Telegram не достучался до сайта: домен не резолвится снаружи или приложение лежит.";
  return "Разберите текст ошибки выше — Telegram пишет причину прямым текстом.";
}

async function call(method, payload) {
  const headers = { "content-type": "application/json" };
  if (apiAuth) headers.authorization = `Bearer ${apiAuth}`;

  let response;
  try {
    response = await fetch(`${apiBase}/bot${token}/${method}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? "не ответил за 20 секунд" : String(error?.message ?? error);
    die(
      `${apiBase} ${reason}.\n` +
        (apiBase.includes("api.telegram.org")
          ? "       С российского VPS Telegram недоступен напрямую — задайте TELEGRAM_API_BASE и TELEGRAM_API_AUTH (docs/ai-proxy.md),\n" +
            "       либо запустите эту команду с машины, у которой есть доступ."
          : "       Прокси не отвечает. Проверьте, что воркер поднят и адрес верный."),
    );
  }

  let body;
  try {
    body = await response.json();
  } catch {
    die(
      `${method}: ответ не JSON (HTTP ${response.status}).\n` +
        (apiBase.includes("api.telegram.org")
          ? "       Вместо Telegram ответил кто-то другой — обычно так выглядит блокировка на пути. Задайте TELEGRAM_API_BASE и TELEGRAM_API_AUTH."
          : "       Скорее всего, TELEGRAM_API_BASE указывает не на Bot API."),
    );
  }

  if (response.status === 401 && body?.error === "Unauthorized") {
    die("Прокси не пустил: TELEGRAM_API_AUTH не совпадает с секретом воркера.");
  }
  if (!body?.ok) {
    const code = body?.error_code ?? response.status;
    const description = body?.description ?? body?.error ?? "без описания";
    die(`${method} → ${code}: ${description}${code === 401 ? "\n       401 от самого Telegram означает неверный TELEGRAM_BOT_TOKEN." : ""}`);
  }
  return body.result;
}

function value(name) {
  const fromEnv = process.env[name];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const fromFile = env[name];
  return fromFile && fromFile.trim() ? fromFile.trim() : "";
}

function mask(raw) {
  const id = raw.split(":")[0];
  return raw.includes(":") ? `${id}:…${raw.slice(-4)}` : `…${raw.slice(-4)}`;
}

function die(message) {
  console.log(`  FAIL ${message}`);
  process.exit(1);
}

/**
 * Парсер .env как у preflight: KEY=value, побеждает последняя строка — так же,
 * как это делает docker compose. Читать первую строку нельзя: именно на этом
 * пустой хвост из .env.example однажды обнулил заполненный токен.
 */
function readEnv(path) {
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const values = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    let raw = trimmed.slice(eq + 1).trim();
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1);
    }
    values[trimmed.slice(0, eq).trim()] = raw;
  }
  return values;
}

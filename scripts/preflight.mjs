#!/usr/bin/env node
/**
 * Проверка окружения перед деплоем: `npm run preflight`.
 *
 * Смысл — поймать всё, что молча ломается уже в бою: забытый токен прокси
 * (тогда разбор молча выключается), включённый приём оплаты без ключей,
 * пароль базы из примера.
 *
 * Читает .env рядом с собой, но переменные из окружения имеют приоритет —
 * в docker compose они приходят именно оттуда.
 */
import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const file = readEnvFile(resolve(root, ".env"));

/**
 * Значения из окружения перекрывают файл — так задумано, в docker compose они
 * приходят именно оттуда. Но пустое значение перекрывать не должно: экспорт
 * вида `ANTHROPIC_AUTH_TOKEN=` в шелле иначе молча прячет заполненный .env, и
 * проверка врёт ровно про то, ради чего её и запускают.
 */
const env = { ...file.values };
for (const [key, raw] of Object.entries(process.env)) {
  if (raw && raw.trim()) env[key] = raw;
}

const problems = [];
const warnings = [];
const notes = [];

// Дубликаты ключей — самая тихая из ошибок в .env: побеждает последняя
// строка, а смотрят обычно на первую. Чаще всего внизу остаётся пустая
// строка из .env.example, которая обнуляет заполненное значение.
for (const [key, lines] of file.duplicates) {
  fail(`${key} встречается в .env несколько раз (строки ${lines.join(", ")}) — считается последняя. Оставьте одну.`);
}

function fail(message) {
  problems.push(message);
}
function warn(message) {
  warnings.push(message);
}
function ok(message) {
  notes.push(message);
}

function value(name) {
  const raw = env[name];
  return raw && raw.trim() ? raw.trim() : "";
}

// --- База данных ------------------------------------------------------------

const password = value("POSTGRES_PASSWORD");
if (!password) {
  fail("POSTGRES_PASSWORD не задан — контейнер базы не поднимется.");
} else if (password.length < 16) {
  fail("POSTGRES_PASSWORD короче 16 символов. Сгенерируйте: openssl rand -hex 24");
} else if (/^(postgres|password|changeme|jivoetelo)$/i.test(password)) {
  fail("POSTGRES_PASSWORD — словарный. Сгенерируйте: openssl rand -hex 24");
} else {
  ok("Пароль базы задан.");
}

const databaseUrl = value("DATABASE_URL");
if (!databaseUrl) {
  warn("DATABASE_URL не задан. В docker compose он собирается автоматически, но локальные команды (npm run dev, миграции) работать не будут.");
} else if (password && databaseUrl.includes("<POSTGRES_PASSWORD>")) {
  fail("В DATABASE_URL остался placeholder <POSTGRES_PASSWORD>.");
} else {
  ok("DATABASE_URL задан.");
}

// --- AI ---------------------------------------------------------------------

const baseUrl = value("ANTHROPIC_BASE_URL");
const authToken = value("ANTHROPIC_AUTH_TOKEN");
const apiKey = value("ANTHROPIC_API_KEY");
const provider = value("AI_PROVIDER");

if (provider === "off" || provider === "mock") {
  ok(
    provider === "off"
      ? "AI_PROVIDER=off — разбор и подсказки выключены, экраны предлагают ручной ввод."
      : "AI_PROVIDER=mock — в бою это то же самое, что off: разбор выключен, выдуманных цифр не будет.",
  );
  // Mock глушил проверку учётных данных — и однажды спрятал пустой токен
  // прокси: обнаружилось это только тогда, когда через тот же прокси
  // понадобился Telegram. Теперь говорим и в режиме заглушки.
  if (baseUrl && !authToken) {
    warn("ANTHROPIC_AUTH_TOKEN пуст. Сейчас это незаметно, но снятие AI_PROVIDER ничего не включит: прокси ответит 403.");
  }
} else if (provider === "demo") {
  warn(
    "AI_PROVIDER=demo — разбор отвечает одним и тем же выдуманным блюдом на любую еду, " +
      "и в интерфейсе это неотличимо от настоящего ответа. Годится, чтобы показать продукт, " +
      "но не для живых пользователей.",
  );
} else if (provider) {
  fail(`AI_PROVIDER="${provider}" — неизвестное значение. Допустимо: пусто (боевой AI), off, demo.`);
} else if (baseUrl && authToken) {
  ok(`AI через прокси: ${baseUrl}`);
} else if (apiKey) {
  warn("Задан прямой ANTHROPIC_API_KEY без прокси. С российского VPS api.anthropic.com обычно недоступен — см. docs/ai-proxy.md.");
} else if (baseUrl && !authToken) {
  fail("ANTHROPIC_BASE_URL задан, а ANTHROPIC_AUTH_TOKEN — нет: прокси ответит 401.");
} else {
  fail("Нет ни ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN, ни ANTHROPIC_API_KEY — разбор и подсказки будут выключены. Если так и задумано, поставьте AI_PROVIDER=off явно.");
}

const budget = value("AI_DAILY_BUDGET_USD");
if (budget && !(Number(budget) > 0)) {
  fail(`AI_DAILY_BUDGET_USD="${budget}" — не положительное число.`);
} else {
  ok(`Дневной потолок расходов на AI: $${budget || "25 (по умолчанию)"}.`);
}

// --- Telegram ---------------------------------------------------------------

const botToken = value("TELEGRAM_BOT_TOKEN");
if (!botToken) {
  warn("TELEGRAM_BOT_TOKEN не задан — Mini App на /tg вернёт 503. Для веб-версии это нормально.");
} else if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(botToken)) {
  fail("TELEGRAM_BOT_TOKEN не похож на токен от @BotFather (формат 123456789:AA...).");
} else {
  ok("Токен Telegram-бота задан.");
}

const telegramApiBase = value("TELEGRAM_API_BASE");
const telegramApiAuth = value("TELEGRAM_API_AUTH");
if (telegramApiBase && !telegramApiAuth) {
  fail("TELEGRAM_API_BASE задан, а TELEGRAM_API_AUTH — нет: прокси ответит 403, и бот не сможет отвечать.");
} else if (telegramApiBase && authToken && telegramApiAuth !== authToken) {
  warn("TELEGRAM_API_AUTH и ANTHROPIC_AUTH_TOKEN различаются, хотя у воркера секрет один. Проверьте, не опечатка ли.");
} else if (telegramApiBase) {
  ok(`Telegram через прокси: ${telegramApiBase}`);
}

const webhookSecret = value("TELEGRAM_WEBHOOK_SECRET");
if (botToken && !webhookSecret) {
  warn("TELEGRAM_WEBHOOK_SECRET не задан — вебхук бота отвечает 503, фото в инбокс приниматься не будут (docs/bot.md).");
} else if (webhookSecret && webhookSecret.length < 24) {
  fail("TELEGRAM_WEBHOOK_SECRET короче 24 символов. Сгенерируйте: openssl rand -hex 32");
} else if (webhookSecret) {
  ok("Секрет вебхука бота задан.");
}

// --- Почта ------------------------------------------------------------------

const smtpHost = value("SMTP_HOST");
const smtpUser = value("SMTP_USER");
const smtpPassword = value("SMTP_PASSWORD");
const emailDisabled = value("EMAIL_ENABLED") === "false";

if (emailDisabled) {
  warn("EMAIL_ENABLED=false — письма серии не отправляются, только пишутся в лог.");
} else if (smtpHost && smtpUser && smtpPassword) {
  ok(`Почта уходит через ${smtpHost}.`);
} else if (smtpHost || smtpUser || smtpPassword) {
  fail("SMTP заполнен частично: нужны SMTP_HOST, SMTP_USER и SMTP_PASSWORD вместе, иначе письма молча не уйдут.");
} else {
  warn("SMTP не настроен — письма после калькулятора будут писаться в лог вместо отправки (docs/email-series.md).");
}

const siteUrl = value("SITE_URL");
if (siteUrl && !/^https?:\/\//.test(siteUrl)) {
  fail(`SITE_URL="${siteUrl}" — нужен абсолютный адрес со схемой.`);
} else if (siteUrl && siteUrl.startsWith("http://")) {
  warn("SITE_URL по http — ссылки в письмах и кнопках бота будут вести на незащищённый адрес.");
} else {
  ok(`Адрес сайта в письмах: ${siteUrl || "https://jivoetelo.ru (по умолчанию)"}.`);
}

if (value("SCHEDULER_ENABLED") === "false") {
  warn("SCHEDULER_ENABLED=false — письма и напоминания отправляться не будут.");
}

// --- Оплата -----------------------------------------------------------------

const paymentsEnabled = value("PAYMENTS_ENABLED") === "true";
const unitpayPublic = value("UNITPAY_PUBLIC_KEY");
const unitpaySecret = value("UNITPAY_SECRET_KEY");

if (paymentsEnabled && (!unitpayPublic || !unitpaySecret)) {
  fail("PAYMENTS_ENABLED=true, но ключи Unitpay не заданы.");
} else if (paymentsEnabled) {
  warn("PAYMENTS_ENABLED=true — приём оплаты включён. Убедитесь, что оферта опубликована и юрлицо готово (docs/legal.md).");
} else {
  ok("Приём оплаты выключен — всё бесплатно, как и задумано.");
}

// --- Прочее -----------------------------------------------------------------

const timezone = value("APP_TIMEZONE") || "Europe/Moscow";
try {
  new Intl.DateTimeFormat("ru-RU", { timeZone: timezone });
  ok(`Таймзона продукта: ${timezone}.`);
} catch {
  fail(`APP_TIMEZONE="${timezone}" — неизвестная таймзона.`);
}

const operator = value("LEGAL_OPERATOR_NAME");
if (!operator) {
  warn("LEGAL_OPERATOR_NAME не задан — в юридических документах останется пометка «реквизиты не заполнены» (docs/legal.md).");
} else {
  ok(`Оператор персональных данных: ${operator}.`);
}

// --- Порт приложения --------------------------------------------------------

/**
 * Проверяем, не занят ли порт кем-то ещё. Дорого стоит узнать это позже:
 * контейнер молча не поднимется, reverse proxy будет проксировать на чужое
 * приложение, а сайт — отвечать 200 чужой главной страницей. Ровно так и
 * вышло на сервере, где рядом жил другой Next.js.
 */
const appPort = Number(value("APP_HOST_PORT") || 3000);
if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65535) {
  fail(`APP_HOST_PORT="${value("APP_HOST_PORT")}" — это не номер порта.`);
} else if (await portAnswers(appPort)) {
  warn(
    `На 127.0.0.1:${appPort} уже кто-то отвечает. Если это не наше приложение — ` +
      `контейнер не поднимется, а reverse proxy будет отдавать чужой сайт. ` +
      `Свободный порт задаётся в APP_HOST_PORT (и в deploy/nginx/jivoetelo-proxy.conf).`,
  );
} else {
  ok(`Порт приложения ${appPort} свободен.`);
}

function portAnswers(port) {
  return new Promise((resolveCheck) => {
    const socket = createConnection({ host: "127.0.0.1", port, timeout: 700 });
    const finish = (answered) => {
      socket.destroy();
      resolveCheck(answered);
    };
    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
    socket.on("timeout", () => finish(false));
  });
}

// --- Вывод ------------------------------------------------------------------

for (const note of notes) console.log(`  ok   ${note}`);
for (const message of warnings) console.log(`  warn ${message}`);
for (const message of problems) console.log(`  FAIL ${message}`);

console.log("");
if (problems.length > 0) {
  console.log(`Проблем: ${problems.length}. Деплоить рано.`);
  process.exit(1);
}
console.log(warnings.length > 0 ? `Предупреждений: ${warnings.length}. Можно деплоить, если они осознанные.` : "Окружение готово.");

/**
 * Минимальный парсер .env: KEY=value, без подстановок и многострочных
 * значений. Помимо значений возвращает ключи, встреченные больше одного раза,
 * с номерами строк — о них обязательно надо сказать вслух.
 */
function readEnvFile(path) {
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return { values: {}, duplicates: new Map() };
  }

  const values = {};
  const seen = new Map();
  content.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let raw = trimmed.slice(eq + 1).trim();
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1);
    }
    values[key] = raw;
    seen.set(key, [...(seen.get(key) ?? []), index + 1]);
  });

  const duplicates = new Map([...seen].filter(([, lines]) => lines.length > 1));
  return { values, duplicates };
}

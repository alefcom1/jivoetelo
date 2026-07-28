/**
 * Запуск браузера для e2e. Playwright не числится в зависимостях проекта:
 * тащить его в `npm ci` перед каждым деплоем ради тестов, которые запускаются
 * вручную, — лишние сотни мегабайт в сборочном шаге. Поэтому он берётся
 * оттуда, где оказался установлен, а браузер — из образа среды.
 */

const MODULE_CANDIDATES = [
  "playwright",
  "/opt/node22/lib/node_modules/playwright/index.mjs",
  "/usr/lib/node_modules/playwright/index.mjs",
];

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium";

async function loadPlaywright() {
  const problems = [];
  for (const candidate of MODULE_CANDIDATES) {
    try {
      return await import(candidate);
    } catch (error) {
      problems.push(`${candidate}: ${error.code ?? error.message}`);
    }
  }
  throw new Error(`Playwright не найден.\n${problems.join("\n")}`);
}

export async function launchBrowser() {
  const { chromium } = await loadPlaywright();
  return await chromium.launch({ executablePath: CHROMIUM_PATH });
}

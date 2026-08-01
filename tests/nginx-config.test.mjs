import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

/**
 * Конфигурация nginx — то, чего не видно ни одной проверкой приложения.
 *
 * ## Что случилось
 *
 * В репозитории лежал `proxy_pass http://127.0.0.1:3000`. На сервере
 * приложение слушает 3100: 3000 занят соседним techperevod. Файл скопировали
 * поверх живого — и весь jivoetelo.ru поехал на приложение соседа.
 *
 * Страшно здесь не то, что сломалось, а то, что ничего не сломалось на вид:
 * `nginx -t` доволен, `curl` отдаёт двухсотку, health-check зелёный — просто
 * страница чужая. Такое находят по жалобам, а не по мониторингу.
 *
 * Поэтому порт из этого файла убран вовсе, и тест следит, чтобы он не
 * вернулся: подставляет его deploy/install-nginx.sh из того же .env, которым
 * живёт контейнер.
 */

const PROXY = "deploy/nginx/jivoetelo-proxy.conf";

test("порт приложения не зашит в конфигурацию", () => {
  const conf = readFileSync(PROXY, "utf8");
  const pass = conf.match(/^\s*proxy_pass\s+(\S+);/m);
  assert.ok(pass, "proxy_pass пропал из конфигурации");
  assert.match(
    pass[1],
    /__APP_HOST_PORT__/,
    `в конфигурации снова зашит адрес «${pass[1]}» — при копировании поверх живого файла ` +
    "он молча уведёт весь сайт на чужое приложение",
  );
});

test("скопированный как есть файл nginx не примет", () => {
  // В этом и смысл заполнителя: ошибка должна быть видна сразу, а не через
  // сутки по жалобам. Порт из букв и подчёркиваний nginx отвергает.
  const conf = readFileSync(PROXY, "utf8");
  const port = conf.match(/proxy_pass\s+http:\/\/127\.0\.0\.1:([^;]+);/)[1];
  assert.ok(!/^\d+$/.test(port), `заполнитель «${port}» выглядит как настоящий порт`);
});

test("установщик подставляет порт и лежит рядом", () => {
  const installer = readFileSync("deploy/install-nginx.sh", "utf8");
  assert.match(installer, /__APP_HOST_PORT__/, "установщик не подставляет порт");
  assert.match(installer, /APP_HOST_PORT=/, "установщик не читает порт из .env");
});

test("в документации нет команды, которая кладёт файл мимо установщика", () => {
  // Именно такая команда и была выполнена. Пока она лежит в документации,
  // её выполнят снова.
  for (const name of readdirSync("docs").filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(`docs/${name}`, "utf8");
    const bad = text.match(/^.*\bcp\b.*jivoetelo-proxy\.conf.*$/m);
    assert.equal(bad, null, `${name}: ${bad?.[0]?.trim()}`);
  }
});

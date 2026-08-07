import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Правка `.env` на сервере (`deploy/set-env.sh`).
 *
 * Скрипт запускается там, куда мы не заходим руками, и правит единственный
 * файл, от которого зависит вся конфигурация: пароль базы, токены, доступ в
 * админку. Ошибка в нём не падает с ошибкой, а тихо оставляет сервис с не тем
 * значением — поэтому здесь проверяется не «отработало без ошибки», а что
 * именно оказалось в файле.
 *
 * `docker` подменяется заглушкой: настоящего демона в проверках нет, а сама
 * подмена ещё и позволяет проверить то, ради чего скрипт и написан, — что он
 * спрашивает значение у контейнера, а не верит своей же записи.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "deploy", "set-env.sh");

const SAMPLE_ENV = [
  "POSTGRES_PASSWORD=secret",
  "# Админка (/admin): админ — это адрес из списка ниже.",
  "# Формат: адреса через запятую, например",
  "#ADMIN_EMAILS=you@jivoetelo.ru,partner@jivoetelo.ru",
  "ADMIN_EMAILS=",
  "ADMIN_EMAILS_LEGACY=old@example.com",
  "LEGAL_NAME=",
  "",
].join("\n");

/** Готовит каталог с `.env` и заглушкой `docker` в PATH. */
function sandbox(envText = SAMPLE_ENV) {
  const dir = mkdtempSync(path.join(tmpdir(), "set-env-"));
  if (envText !== null) writeFileSync(path.join(dir, ".env"), envText);
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  // Заглушка отвечает на `compose exec -T app printenv ИМЯ` тем, что реально
  // лежит в .env, — то есть ведёт себя как контейнер, перечитавший файл.
  const stub = [
    "#!/usr/bin/env bash",
    'if [ "$1" = "compose" ] && [ "$2" = "exec" ]; then',
    '  name="${@: -1}"',
    '  sed -n "s/^${name}=//p" "$PWD/.env" | tail -n1',
    "  exit 0",
    "fi",
    "exit 0",
  ].join("\n");
  writeFileSync(path.join(bin, "docker"), stub);
  chmodSync(path.join(bin, "docker"), 0o755);
  return { dir, bin };
}

function run({ dir, bin }, name, value) {
  return execFileSync("bash", [SCRIPT, name, Buffer.from(value, "utf8").toString("base64")], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DEPLOY_PATH: dir },
    encoding: "utf8",
  });
}

test("значение встаёт на место переменной, а не в конец файла", () => {
  const box = sandbox();
  run(box, "ADMIN_EMAILS", "alefcom1@gmail.com");
  const lines = readFileSync(path.join(box.dir, ".env"), "utf8").split("\n");
  assert.equal(lines[4], "ADMIN_EMAILS=alefcom1@gmail.com");
  // Комментарий объясняет переменную и обязан остаться рядом с ней: значение,
  // уехавшее в конец файла, оставляет объяснение объяснять пустоту.
  assert.equal(lines[2], "# Формат: адреса через запятую, например");
});

test("правится живая строка, а не закомментированный пример над ней", () => {
  // В .env.example над каждой переменной стоит образец с решёткой. Совпадение
  // «где-то в строке» попало бы в него: пример получил бы значение, живая
  // строка осталась бы пустой, и сервер продолжил бы работать по-старому.
  const box = sandbox();
  run(box, "ADMIN_EMAILS", "new@example.com");
  const text = readFileSync(path.join(box.dir, ".env"), "utf8");
  assert.ok(
    text.includes("#ADMIN_EMAILS=you@jivoetelo.ru,partner@jivoetelo.ru"),
    "переписан закомментированный пример вместо настоящей строки",
  );
  assert.ok(text.includes("\nADMIN_EMAILS=new@example.com"), "настоящая строка не получила значение");
});

test("похожее имя не считается тем же самым", () => {
  const box = sandbox();
  run(box, "ADMIN_EMAILS", "new@example.com");
  const text = readFileSync(path.join(box.dir, ".env"), "utf8");
  assert.ok(text.includes("ADMIN_EMAILS_LEGACY=old@example.com"), "затронута соседняя переменная");
});

test("значение со знаками оболочки доезжает дословно", () => {
  // Ради этого случая значение и едет base64: кавычка или `$(` в нём проходит
  // разбор оболочки дважды — на runner'е и на сервере.
  const box = sandbox();
  const nasty = `a'b"c$(whoami)\\d&e f@example.com`;
  run(box, "ADMIN_EMAILS", nasty);
  const line = readFileSync(path.join(box.dir, ".env"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("ADMIN_EMAILS="));
  assert.equal(line, `ADMIN_EMAILS=${nasty}`);
});

test("переменной ещё нет — дописывается в конец", () => {
  const box = sandbox("POSTGRES_PASSWORD=secret\n");
  run(box, "ADMIN_EMAILS", "a@example.com");
  const text = readFileSync(path.join(box.dir, ".env"), "utf8");
  assert.match(text, /^POSTGRES_PASSWORD=secret\nADMIN_EMAILS=a@example\.com\n$/);
});

test("строка с переменной остаётся ровно одна", () => {
  const box = sandbox();
  run(box, "ADMIN_EMAILS", "первый@example.com");
  run(box, "ADMIN_EMAILS", "второй@example.com");
  const hits = readFileSync(path.join(box.dir, ".env"), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("ADMIN_EMAILS="));
  assert.deepEqual(hits, ["ADMIN_EMAILS=второй@example.com"]);
});

test("копия до правки сохраняется", () => {
  const box = sandbox();
  run(box, "ADMIN_EMAILS", "a@example.com");
  const backups = readdirSync(box.dir).filter((name) => name.startsWith(".env.bak."));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(path.join(box.dir, backups[0]), "utf8"), SAMPLE_ENV);
});

test("значение в лог не печатается", () => {
  // Скрипт общий: однажды им зададут токен. Привычка печатать значение живёт
  // дольше, чем повод её завести, поэтому проверяем сейчас.
  const box = sandbox();
  const output = run(box, "ADMIN_EMAILS", "sekret@example.com");
  assert.ok(!output.includes("sekret@example.com"), "значение попало в лог");
  assert.match(output, /длина значения: 18/);
});

test("без .env скрипт отказывается работать", () => {
  const box = sandbox(null);
  assert.throws(() => run(box, "ADMIN_EMAILS", "a@example.com"), /Status 1|Command failed/);
});

test("workflow отдаёт имя переменной списком, а не строкой", async () => {
  // Свободная строка здесь — самый тихий отказ из возможных: ADMIN_EMAIL
  // вместо ADMIN_EMAILS запишется без ошибки, приложение его не прочитает, и
  // выглядеть это будет как «ничего не изменилось».
  const workflow = readFileSync(path.join(ROOT, ".github", "workflows", "set-env.yml"), "utf8");
  assert.match(workflow, /name:\s*\n\s*description:[^\n]*\n\s*required: true\n(\s*#[^\n]*\n)*\s*type: choice/);
  assert.match(workflow, /options:\s*\n\s*- ADMIN_EMAILS/);
});

test("строка из .env целиком не превращается в ИМЯ=ИМЯ=значение", () => {
  // Так мы потеряли TELEGRAM_MINIAPP_URL: в поле значения оказалась строка
  // ровно в том виде, в каком переменная записана в .env.example. Telegram
  // отверг кнопку с таким адресом, а вместе с кнопкой — всё сообщение, и бот
  // замолчал на /start. Ошибка естественная, цена у неё была несоразмерная.
  const box = sandbox();
  run(box, "ADMIN_EMAILS", "ADMIN_EMAILS=new@example.com");
  const line = readFileSync(path.join(box.dir, ".env"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("ADMIN_EMAILS="));
  assert.equal(line, "ADMIN_EMAILS=new@example.com");
});

test("имя внутри значения, но не в начале, остаётся нетронутым", () => {
  // Срезаем только приставку и только целиком: значение, где имя переменной
  // встречается по делу, портить нельзя.
  const box = sandbox();
  run(box, "ADMIN_EMAILS", "ADMIN_EMAILS@example.com");
  const line = readFileSync(path.join(box.dir, ".env"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("ADMIN_EMAILS="));
  assert.equal(line, "ADMIN_EMAILS=ADMIN_EMAILS@example.com");
});

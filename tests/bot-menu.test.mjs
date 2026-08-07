import assert from "node:assert/strict";
import { test } from "node:test";
import { botCommands, commandFromLabel, mainKeyboard, MENU } from "../lib/bot/menu.ts";
import { htmlProblem } from "../lib/bot/markup.ts";
import { ANSWERS, SETTINGS, settingsText } from "../lib/bot/texts.ts";

/**
 * Постоянная клавиатура бота.
 *
 * Главное свойство здесь — что нажатие возвращается. Telegram присылает его
 * обычным сообщением с текстом надписи, без всякого признака кнопки: стоит
 * надписи и разбору разъехаться, и бот перестанет узнавать собственную
 * кнопку. Снаружи это неотличимо от поломки, поэтому проверяется в обе
 * стороны — от кнопки к команде и обратно.
 */

const links = { inboxUrl: "https://jivoetelo.ru/app/inbox", miniAppUrl: null, planUrl: "", premiumUrl: "", dishUrl: () => "" };
const withApp = { ...links, miniAppUrl: "https://jivoetelo.ru/tg" };

test("каждая кнопка узнаётся и превращается в свою команду", () => {
  for (const item of MENU) {
    assert.equal(commandFromLabel(item.label), item.command, item.label);
  }
});

test("надпись без значка узнаётся тоже", () => {
  // Человек может набрать «Итог дня» руками — значок он не воспроизведёт.
  assert.equal(commandFromLabel("Итог дня"), "/day");
  assert.equal(commandFromLabel("настройки"), "/settings");
  assert.equal(commandFromLabel("  Помощь  "), "/help");
});

test("обычный текст проходит насквозь", () => {
  // Иначе кнопки съели бы вес, коды привязки и вопросы словами.
  assert.equal(commandFromLabel("72,4"), "72,4");
  assert.equal(commandFromLabel("A1B2C3D4"), "A1B2C3D4");
  assert.equal(commandFromLabel("сколько стоит подписка"), "сколько стоит подписка");
});

test("кнопка премиума появляется только с включённым приёмом денег", () => {
  const off = mainKeyboard(links, false).keyboard.flat().map((b) => b.text);
  const on = mainKeyboard(links, true).keyboard.flat().map((b) => b.text);
  assert.ok(!off.some((text) => text.includes("Премиум")), "кнопка оплаты при выключенном приёме денег");
  assert.ok(on.some((text) => text.includes("Премиум")));
  assert.equal(on.length, off.length + 1);
});

test("клавиатура раскладывается по два столбца и не теряет кнопок", () => {
  const keyboard = mainKeyboard(links, true).keyboard;
  assert.ok(keyboard.every((row) => row.length <= 2), "три кнопки в ряд не помещаются на телефоне");
  assert.equal(keyboard.flat().length, MENU.length);
});

test("«Дневник» открывает Mini App напрямую, когда он заведён", () => {
  const direct = mainKeyboard(withApp).keyboard.flat().find((b) => b.text.includes("Дневник"));
  assert.deepEqual(direct?.web_app, { url: "https://jivoetelo.ru/tg" });

  // Без Mini App кнопка остаётся текстовой: ссылок постоянная клавиатура не
  // умеет, и человек получит сообщение с обычной ссылкой.
  const plain = mainKeyboard(links).keyboard.flat().find((b) => b.text.includes("Дневник"));
  assert.equal(plain?.web_app, undefined);
});

test("клавиатура не прячется после нажатия и не занимает пол-экрана", () => {
  const keyboard = mainKeyboard(links);
  assert.equal(keyboard.is_persistent, true, "иначе кнопки исчезают ровно тогда, когда понадобились");
  assert.equal(keyboard.resize_keyboard, true);
});

test("список команд собран из того же меню и начинается со /start", () => {
  const commands = botCommands(false);
  assert.equal(commands[0].command, "start");
  assert.ok(commands.every((c) => !c.command.startsWith("/")), "Telegram ждёт имя без косой черты");
  assert.ok(commands.every((c) => c.description.length > 0 && c.description.length <= 256));

  // Всё, что есть на клавиатуре, должно быть и в списке: человек, узнавший
  // про кнопку, ищет её же командой — и наоборот.
  for (const item of MENU) {
    if (item.paidOnly) continue;
    assert.ok(
      commands.some((c) => `/${c.command}` === item.command),
      `${item.command} есть кнопкой, но нет в списке команд`,
    );
  }
  assert.ok(botCommands(true).some((c) => c.command === "premium"));
});

test("справка называет команды, которые бот действительно знает", () => {
  // Справка и меню — два описания одного бота, и расходятся они молча.
  // Закрывающие теги — не команды: «</b>» иначе читается как «/b».
  const mentioned = ANSWERS.help.match(/(?<!<)\/[a-z]+/g) ?? [];
  const known = new Set([...botCommands(true).map((c) => `/${c.command}`), "/stopweight"]);
  for (const command of mentioned) assert.ok(known.has(command), `справка обещает ${command}`);
});

test("разметка новых сообщений корректна", () => {
  const state = { reminders: true, weighReminders: false, plan: "free" };
  for (const text of [ANSWERS.help, ANSWERS.weightHow, SETTINGS.needAccount, settingsText(state)]) {
    assert.equal(htmlProblem(text), null, text.slice(0, 40));
  }
});

test("экран настроек показывает состояние, а не только кнопки", () => {
  const on = settingsText({ reminders: true, weighReminders: true, plan: "premium" });
  assert.ok(on.includes("включены"));
  assert.ok(on.includes("раз в неделю"));
  assert.ok(on.includes("премиум"));

  const off = settingsText({ reminders: false, weighReminders: false, plan: "free" });
  assert.ok(off.includes("выключены"));
  assert.ok(off.includes("бесплатный"));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeHtml, htmlProblem } from "../lib/bot/markup.ts";
import { ANSWERS, GREETING, photoSavedText, PHOTO, TEXT_LOOKS_LIKE_FOOD, UNSUPPORTED } from "../lib/bot/texts.ts";
import { GENTLE_NUDGE_TEXT, photoDigestText } from "../lib/reminders.ts";

/**
 * Разметка у нас статическая, и сломать её можно только правкой текста.
 * Проверка тут ровно за этим: неверный тег означает ошибку 400 от Telegram,
 * то есть молчащего бота, а увидеть это иначе можно лишь открыв переписку.
 */

/** Все строки, которые бот отправляет с parse_mode: HTML. */
function allMessages() {
  const groups = { GREETING, PHOTO, UNSUPPORTED, ANSWERS };
  const out = [];
  for (const [group, block] of Object.entries(groups)) {
    for (const [key, text] of Object.entries(block)) out.push([`${group}.${key}`, text]);
  }
  out.push(["TEXT_LOOKS_LIKE_FOOD", TEXT_LOOKS_LIKE_FOOD]);
  out.push(["photoSavedText(1)", photoSavedText(1)]);
  out.push(["photoSavedText(7)", photoSavedText(7)]);
  out.push(["GENTLE_NUDGE_TEXT", GENTLE_NUDGE_TEXT]);
  out.push(["photoDigestText(1)", photoDigestText(1)]);
  out.push(["photoDigestText(4)", photoDigestText(4)]);
  return out;
}

test("разметка всех сообщений бота корректна", () => {
  for (const [name, text] of allMessages()) {
    assert.equal(htmlProblem(text), null, `${name}: ${htmlProblem(text)}`);
  }
});

test("валидатор ловит то, ради чего написан", () => {
  assert.equal(htmlProblem("<b>жирный</b> и <i>курсив</i>"), null);
  assert.equal(htmlProblem("1 &lt; 2 &amp; 3"), null);
  assert.match(htmlProblem("<b>не закрыт"), /не закрыт/);
  assert.match(htmlProblem("<b>перепутан</i>"), /закрывает не то/);
  assert.match(htmlProblem("<div>чужой тег</div>"), /не понимает/);
  assert.match(htmlProblem("5 < 7"), /голый «<»/);
  assert.match(htmlProblem("Ben & Jerry"), /голый «&»/);
});

test("экранирование закрывает все три особых знака", () => {
  assert.equal(escapeHtml("<Аня> & Ко"), "&lt;Аня&gt; &amp; Ко");
  // Экранированное — уже безопасно, повторно ломаться не должно.
  assert.equal(htmlProblem(escapeHtml("<script>alert(1)</script> & co")), null);
});

/**
 * Приветствие уходит подписью к картинке, а подпись Telegram обрезает на
 * 1024 символах. Обрезанный текст — это не «некрасиво», а потерянная
 * инструкция по привязке аккаунта в самом конце сообщения.
 */
test("приветствия помещаются в подпись к фото", () => {
  for (const [key, text] of Object.entries(GREETING)) {
    assert.ok(text.length <= 1024, `GREETING.${key}: ${text.length} символов`);
  }
});

/**
 * Правило из texts.ts: один значок в начале строки как признак состояния.
 * Проверяем самое дешёвое для проверки и самое заметное при нарушении —
 * что значков не два подряд.
 */
test("значки не идут парами", () => {
  const pair = /\p{Extended_Pictographic}[️‍]*\s*\p{Extended_Pictographic}/u;
  for (const [name, text] of allMessages()) {
    assert.doesNotMatch(text, pair, `${name}: два значка подряд`);
  }
});

test("бот не повторяет приёмов, разобранных консилиумом", () => {
  // Список — из docs/bot.md, раздел «Чего мы никогда не напишем». Проверка
  // дешёвая, а класс ошибки дорогой: одна бодрая фраза, вставленная ради
  // конверсии, противоречит нашим же публичным документам.
  const FORBIDDEN = [
    [/\d+\s*%\s*(пользовател|людей|наших)/i, "выдуманная статистика"],
    [/сгор(ит|ает)\s+через|осталось\s+\d+:\d+/i, "искусственный таймер"],
    [/к концу курса|к \d+ (январ|феврал|март|апрел|ма|июн|июл|август|сентябр|октябр|ноябр|декабр)/i, "обещание веса к дате"],
    [/имт\b|индекс массы тела/i, "ИМТ показывать не договаривались"],
    [/норма воды|литр(ов|а)? в (день|сутки)/i, "норму воды мы не считаем"],
    [/проблемн(ая|ую) зон/i, "локального жиросжигания не существует"],
    [/гарантиру|обещаем|точно похудеете/i, "гарантия результата"],
  ];
  for (const [name, text] of allMessages()) {
    for (const [pattern, why] of FORBIDDEN) {
      assert.doesNotMatch(text, pattern, `${name}: ${why}`);
    }
  }
});

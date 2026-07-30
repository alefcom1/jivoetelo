import test from "node:test";
import assert from "node:assert/strict";
import {
  LETTER_DELAY_DAYS,
  LETTER_NUMBERS,
  SEND_WINDOW_FROM_HOUR,
  SEND_WINDOW_UNTIL_HOUR,
  isLetterNumber,
  parseSeriesContext,
  renderLetter,
  scheduleLetterAt,
} from "../lib/email-series.ts";
import { localMoment } from "../lib/dates.ts";

const CTX = { kcalTarget: 1870, kcalMin: 1740, kcalMax: 2000, proteinTarget: 96 };
const LINKS = {
  siteUrl: "https://jivoetelo.ru",
  unsubscribeUrl: "https://jivoetelo.ru/pochta/otpiska?token=abc",
};

test("в готовом письме не остаётся незаполненных подстановок", () => {
  for (const letter of LETTER_NUMBERS) {
    const rendered = renderLetter(letter, CTX, LINKS);
    for (const part of [rendered.subject, rendered.preheader, rendered.text, rendered.html]) {
      assert.doesNotMatch(part, /\{\{|\}\}/, `письмо ${letter}`);
    }
  }
});

test("числа расчёта попадают в первое письмо", () => {
  const { subject, text } = renderLetter(1, CTX, LINKS);
  assert.match(subject, /1 870/);
  assert.match(text, /1 740–2 000/);
  assert.match(text, /96 г/);
});

test("разряды разделяются неразрывным пробелом, а не обычным", () => {
  const { text } = renderLetter(1, { ...CTX, kcalTarget: 1870 }, LINKS);
  assert.ok(text.includes("1 870"));
  assert.ok(!text.includes("1 870"));
});

test("трёхзначные числа не разбиваются", () => {
  const { text } = renderLetter(1, { ...CTX, proteinTarget: 96 }, LINKS);
  assert.match(text, /около 96 г/);
});

test("каждое письмо содержит ссылку отписки в обоих форматах", () => {
  for (const letter of LETTER_NUMBERS) {
    const rendered = renderLetter(letter, CTX, LINKS);
    assert.ok(rendered.text.includes(LINKS.unsubscribeUrl), `текст письма ${letter}`);
    assert.ok(rendered.html.includes(LINKS.unsubscribeUrl), `html письма ${letter}`);
  }
});

test("в письмах нет давления и обещаний результата", () => {
  for (const letter of LETTER_NUMBERS) {
    const { subject, text } = renderLetter(letter, CTX, LINKS);
    const body = `${subject}\n${text}`;
    assert.doesNotMatch(body, /успей|только сегодня|последний шанс|гарант|за неделю минус|сжига|детокс/i, `письмо ${letter}`);
    assert.doesNotMatch(subject, /!/, `тема письма ${letter}`);
  }
});

test("третье письмо не забывает про границы сервиса", () => {
  const { text } = renderLetter(3, CTX, LINKS);
  assert.match(text, /не заменяет консультацию врача/);
});

test("html экранируется: подставленный адрес не ломает разметку", () => {
  const rendered = renderLetter(1, CTX, {
    siteUrl: "https://jivoetelo.ru",
    unsubscribeUrl: 'https://jivoetelo.ru/x?t="><script>alert(1)</script>',
  });
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /&quot;&gt;&lt;script&gt;/);
});

test("темы писем помещаются в список входящих", () => {
  for (const letter of LETTER_NUMBERS) {
    const { subject } = renderLetter(letter, CTX, LINKS);
    assert.ok(subject.length <= 60, `${letter}: ${subject.length}`);
  }
});

// Форма подписки теперь стоит не только на расчёте энергии: у квиза и у
// страницы блюда чисел нет вовсе, а у белка и темпа — только часть из тех
// четырёх, что знают тексты писем. Эти тесты проверяют, что renderLetter не
// падает на неполном контексте и не оставляет писем без единого абзаца.
// Абзац без плейсхолдера, взятый из каждого шаблона, — маркер того, что
// текст про сам подход (а не про конкретные цифры) уцелел в письме.
const PLACEHOLDER_FREE_MARKER = {
  1: /Формула Миффлина-Сан Жеора/,
  2: /У вас есть то, чего у формулы нет по определению/,
  3: /В приложении это устроено так/,
};

test("без контекста письмо всё равно связное — просто без чисел", () => {
  for (const letter of LETTER_NUMBERS) {
    const rendered = renderLetter(letter, {}, LINKS);
    for (const part of [rendered.subject, rendered.preheader, rendered.text, rendered.html]) {
      assert.doesNotMatch(part, /\{\{|\}\}/, `письмо ${letter}`);
    }
    // Абзацы про формулу и её ограничения не завязаны на конкретные цифры —
    // они остаются в письме и без контекста, а не выпадают вместе с числами.
    assert.match(rendered.text, PLACEHOLDER_FREE_MARKER[letter], `письмо ${letter} потеряло текст без цифр`);
  }
});

test("тема первого письма не остаётся с дырой от отсутствующего kcalTarget", () => {
  const { subject } = renderLetter(1, {}, LINKS);
  assert.doesNotMatch(subject, /\{\{|\}\}/);
  assert.ok(subject.length > 0 && subject.length <= 60);
});

test("частичный контекст заполняет то, что есть, и пропускает абзац с недостающим числом", () => {
  // У расчёта белка есть только proteinTarget — абзац первого письма про
  // диапазон ккал (kcalMin/kcalMax) в этом случае пропадает, а абзац про
  // белок остаётся.
  const { text } = renderLetter(1, { proteinTarget: 96 }, LINKS);
  assert.match(text, /96 г/);
  assert.doesNotMatch(text, /\{\{|\}\}/);
});

test("контекст из базы проверяется заново", () => {
  assert.deepEqual(parseSeriesContext(CTX), CTX);
  assert.equal(parseSeriesContext(null), null);
  assert.equal(parseSeriesContext("1870"), null);
  assert.equal(parseSeriesContext({ ...CTX, kcalTarget: 0 }), null);
  assert.equal(parseSeriesContext({ ...CTX, proteinTarget: "много" }), null);
});

test("несогласованные границы отбраковываются: письмо с 2000–1740 бессмысленно", () => {
  assert.equal(parseSeriesContext({ ...CTX, kcalMin: 2100 }), null);
  assert.equal(parseSeriesContext({ ...CTX, kcalMax: 1800 }), null);
});

// Раньше форма подписки стояла только на расчёте энергии, и все четыре поля
// были обязательны. Теперь источников несколько, и у каждого свой набор
// чисел — эти тесты фиксируют новое, более мягкое правило.
test("поле, которого калькулятор не считает, — это не ошибка", () => {
  // У расчёта белка нет kcalTarget вовсе, и это не повод браковать контекст —
  // он просто состоит из одного числа.
  assert.deepEqual(parseSeriesContext({ proteinTarget: 96 }), { proteinTarget: 96 });
  assert.deepEqual(parseSeriesContext({ kcalTarget: 1870 }), { kcalTarget: 1870 });
});

test("пустой контекст — валиден: у страницы блюда и у квиза чисел нет вовсе", () => {
  assert.deepEqual(parseSeriesContext({}), {});
});

test("согласованность границ проверяется только для пар, что вообще присутствуют", () => {
  // Одного kcalTarget без kcalMin/kcalMax сравнивать не с чем — это валидный частичный контекст.
  assert.deepEqual(parseSeriesContext({ kcalTarget: 1870 }), { kcalTarget: 1870 });
  // А если оба края есть без цели, перевёрнутая пара всё равно отбраковывается.
  assert.equal(parseSeriesContext({ kcalMin: 2000, kcalMax: 1800 }), null);
  assert.deepEqual(parseSeriesContext({ kcalMin: 1800, kcalMax: 2000 }), { kcalMin: 1800, kcalMax: 2000 });
});

test("лишние поля в объекте игнорируются, а не попадают в контекст", () => {
  assert.deepEqual(parseSeriesContext({ proteinTarget: 96, dishSlug: "borshch" }), { proteinTarget: 96 });
});

test("первое письмо уходит сразу, остальные — через 2 и 5 дней", () => {
  const at = new Date("2026-07-28T09:00:00Z"); // 12:00 в Москве, внутри окна
  assert.equal(scheduleLetterAt(at, 1).getTime(), at.getTime());
  assert.equal(scheduleLetterAt(at, 2).getTime(), at.getTime() + 2 * 86400_000);
  assert.equal(scheduleLetterAt(at, 3).getTime(), at.getTime() + 5 * 86400_000);
});

test("письмо, выпавшее на ночь, сдвигается в дневное окно", () => {
  // Подписка в 03:20 по Москве: через два дня будет снова 03:20.
  const at = new Date("2026-07-28T00:20:00Z");
  const scheduled = scheduleLetterAt(at, 2, "Europe/Moscow");
  const moment = localMoment(scheduled, "Europe/Moscow");
  assert.ok(moment.hour >= SEND_WINDOW_FROM_HOUR && moment.hour < SEND_WINDOW_UNTIL_HOUR, moment.time);
  assert.ok(scheduled.getTime() > at.getTime() + 2 * 86400_000);
});

test("сдвиг в окно работает для любого часа подписки", () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const at = new Date(Date.UTC(2026, 6, 28, hour, 0, 0));
    for (const letter of [2, 3]) {
      const scheduled = scheduleLetterAt(at, letter, "Europe/Moscow");
      const moment = localMoment(scheduled, "Europe/Moscow");
      assert.ok(
        moment.hour >= SEND_WINDOW_FROM_HOUR && moment.hour < SEND_WINDOW_UNTIL_HOUR,
        `час подписки ${hour}, письмо ${letter}: ${moment.time}`,
      );
      // Сдвиг только вперёд: письмо не может прийти раньше своего срока.
      assert.ok(scheduled.getTime() >= at.getTime() + LETTER_DELAY_DAYS[letter] * 86400_000);
    }
  }
});

test("номера писем проверяются", () => {
  assert.ok(isLetterNumber(1));
  assert.ok(isLetterNumber(3));
  assert.ok(!isLetterNumber(0));
  assert.ok(!isLetterNumber(4));
});

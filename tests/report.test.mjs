import assert from "node:assert/strict";
import { test } from "node:test";
import { localMoment } from "../lib/dates.ts";
import { buildReport, isReportWorthSending } from "../lib/report.ts";
import {
  MIN_DAYS,
  periodFor,
  periodLabel,
  previousMonth,
  previousWeek,
  weekStart,
  withinSendWindow,
} from "../lib/report-period.ts";
import { renderReportEmail, renderReportTelegram, TELEGRAM_LIMIT } from "../lib/report-render.ts";
import { DEFAULT_REPORT_PREFERENCES, resolveChannels } from "../lib/report-prefs.ts";
import { computeStreak } from "../lib/streak.ts";

// ── Периоды ──────────────────────────────────────────────────────────────

test("неделя считается от понедельника", () => {
  assert.equal(weekStart("2026-03-18"), "2026-03-16"); // среда → понедельник
  assert.equal(weekStart("2026-03-16"), "2026-03-16"); // сам понедельник
  assert.equal(weekStart("2026-03-22"), "2026-03-16"); // воскресенье — конец той же недели
});

test("отчёт за прошлую неделю не меняется от дня запуска внутри недели", () => {
  // Это и есть защита от пропущенного запуска: если планировщик не сработал в
  // понедельник, во вторник посчитается тот же период, а уникальный индекс не
  // даст отправить второй раз.
  const monday = previousWeek("2026-03-23");
  assert.deepEqual(monday, { kind: "weekly", from: "2026-03-16", to: "2026-03-22" });
  assert.deepEqual(previousWeek("2026-03-25"), monday);
  assert.deepEqual(previousWeek("2026-03-29"), monday, "воскресенье — всё ещё та же неделя");

  // А в следующий понедельник период уже другой.
  assert.deepEqual(previousWeek("2026-03-30"), { kind: "weekly", from: "2026-03-23", to: "2026-03-29" });
});

test("месяц берётся календарный, включая февраль и високосный год", () => {
  assert.deepEqual(previousMonth("2026-04-01"), { kind: "monthly", from: "2026-03-01", to: "2026-03-31" });
  assert.deepEqual(previousMonth("2026-03-05"), { kind: "monthly", from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(previousMonth("2024-03-01"), { kind: "monthly", from: "2024-02-01", to: "2024-02-29" });
  // Через границу года.
  assert.deepEqual(previousMonth("2026-01-01"), { kind: "monthly", from: "2025-12-01", to: "2025-12-31" });
});

test("подпись периода читается по-человечески", () => {
  assert.equal(periodLabel(previousWeek("2026-03-23")), "16–22 марта");
  assert.equal(periodLabel(previousMonth("2026-04-01")), "Март");
  // Неделя на стыке месяцев называет оба.
  assert.equal(periodLabel({ kind: "weekly", from: "2026-03-30", to: "2026-04-05" }), "30 марта — 5 апреля");
});

test("окно отправки — день, а не ночь", () => {
  const at = (hour) => localMoment(new Date(Date.UTC(2026, 2, 23, hour - 3)), "Europe/Moscow");
  assert.equal(withinSendWindow(at(4)), false, "в четыре утра отчёт разбудил бы уведомлением");
  assert.equal(withinSendWindow(at(10)), true);
  assert.equal(withinSendWindow(at(20)), true);
  assert.equal(withinSendWindow(at(23)), false, "«за прошедшую неделю» в полночь звучит странно");
});

// ── Каналы ───────────────────────────────────────────────────────────────

const BOTH_AVAILABLE = { hasEmail: true, hasTelegram: true };

test("по умолчанию неделя уходит в Telegram, месяц — на почту", () => {
  const prefs = DEFAULT_REPORT_PREFERENCES;
  assert.deepEqual(resolveChannels("weekly", prefs, BOTH_AVAILABLE), ["telegram"]);
  assert.deepEqual(resolveChannels("monthly", prefs, BOTH_AVAILABLE), ["email"]);
});

test("без Telegram «авто» уходит на почту, и наоборот", () => {
  const prefs = DEFAULT_REPORT_PREFERENCES;
  assert.deepEqual(resolveChannels("weekly", prefs, { hasEmail: true, hasTelegram: false }), ["email"]);
  assert.deepEqual(resolveChannels("monthly", prefs, { hasEmail: false, hasTelegram: true }), ["telegram"]);
  assert.deepEqual(resolveChannels("weekly", prefs, { hasEmail: false, hasTelegram: false }), []);
});

test("«авто» никогда не шлёт одно и то же дважды", () => {
  // Отчёт, пришедший и в почту, и в Telegram, читается как сбой рассылки.
  // Два канала сразу — только если человек попросил явно.
  const auto = resolveChannels("weekly", DEFAULT_REPORT_PREFERENCES, BOTH_AVAILABLE);
  assert.equal(auto.length, 1);
  const both = resolveChannels("weekly", { ...DEFAULT_REPORT_PREFERENCES, weekly: "both" }, BOTH_AVAILABLE);
  assert.deepEqual(both.sort(), ["email", "telegram"]);
});

test("выключенные отчёты не уходят никуда", () => {
  const off = { ...DEFAULT_REPORT_PREFERENCES, weekly: "off", monthly: "off" };
  assert.deepEqual(resolveChannels("weekly", off, BOTH_AVAILABLE), []);
  assert.deepEqual(resolveChannels("monthly", off, BOTH_AVAILABLE), []);
});

test("явно выбранный канал не подменяется на доступный", () => {
  // Человек попросил почту — значит, почту. Молча отправить в Telegram, если
  // почты нет, значит проигнорировать выбор.
  const prefs = { ...DEFAULT_REPORT_PREFERENCES, weekly: "email" };
  assert.deepEqual(resolveChannels("weekly", prefs, { hasEmail: false, hasTelegram: true }), []);
});

test("килограммы в отчётах включены по умолчанию", () => {
  assert.equal(DEFAULT_REPORT_PREFERENCES.weightNumbers, true);
});

// ── Содержание ───────────────────────────────────────────────────────────

const TARGETS = { kcalTarget: 2000, kcalMin: 1800, kcalMax: 2200, proteinTarget: 110, fiberTarget: 28 };

function dayStats(days, kcal = 1950, protein = 105) {
  return days.map((day) => ({ day, kcal, protein, fiber: 24 }));
}

function reportInput(overrides = {}) {
  const period = previousWeek("2026-03-23");
  const days = ["2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20"];
  return {
    period,
    showCalories: true,
    weightNumbers: true,
    dayStats: dayStats(days),
    mealStats: {
      key: "week", label: "За неделю", from: period.from, to: period.to,
      days: 7, mealCount: 17, daysLogged: 5, perLoggedDay: 3.4,
      byType: [{ mealType: "lunch", label: "Обед", count: 6, typicalTime: "13:20" }],
    },
    targets: TARGETS,
    weeklyTrendChangeKg: -0.4,
    latestWeightKg: 78.4,
    streak: computeStreak(days, "2026-03-22"),
    impact: null,
    ...overrides,
  };
}

test("в отчёте есть количество приёмов пищи — то, ради чего он и собирается", () => {
  const report = buildReport(reportInput());
  const numbers = report.highlights.map((h) => `${h.value} ${h.label}`).join(" | ");
  assert.match(numbers, /17 приёмов пищи/, `получили: ${numbers}`);

  const meals = report.sections.find((s) => s.title === "Приёмы пищи");
  assert.ok(meals, "раздел «Приёмы пищи» обязателен");
  assert.match(meals.text, /17 приёмов пищи/);
  assert.match(meals.text, /13:20/, "обычное время приёма должно быть названо");
});

test("месячный отчёт считает дни по настоящей длине месяца", () => {
  const february = buildReport(reportInput({
    period: previousMonth("2026-03-10"),
    dayStats: dayStats(Array.from({ length: 20 }, (_, i) => `2026-02-${String(i + 1).padStart(2, "0")}`)),
  }));
  const main = february.sections.find((s) => s.title === "Главное");
  assert.match(main.text, /20 из 28 дней/, `в феврале 28 дней, а не 30: ${main.text}`);
  assert.equal(february.title, "Месяц: Февраль");

  const focus = february.sections.find((s) => s.title.startsWith("Фокус"));
  assert.equal(focus.title, "Фокус на месяц");
});

test("килограммы показываются по настройке, тренд — всегда", () => {
  const withNumbers = buildReport(reportInput());
  const labels = (report) => report.highlights.map((h) => h.label).join(" | ");
  assert.match(labels(withNumbers), /вес на конец периода/);

  const without = buildReport(reportInput({ weightNumbers: false }));
  assert.ok(!/вес на конец периода/.test(labels(without)), `вес не должен показываться: ${labels(without)}`);
  assert.match(labels(without), /тренд, кг в неделю/, "тренд — это изменение, а не вес, он остаётся");
});

test("с выключенными калориями их нет ни в числах, ни в тексте", () => {
  const report = buildReport(reportInput({ showCalories: false }));
  const all = [...report.highlights.map((h) => `${h.value} ${h.label}`), ...report.sections.map((s) => s.text)].join(" ");
  assert.ok(!/ккал/.test(all), `калории просочились: ${all}`);
});

test("раздел «Ритм» говорит про серию без упрёка", () => {
  const rhythm = buildReport(reportInput()).sections.find((s) => s.title === "Ритм");
  assert.ok(rhythm, "раздел «Ритм» ожидался");
  assert.match(rhythm.text, /Всего дней с записями: 5/);
  assert.ok(!/вы пропустили|вы забыли/i.test(rhythm.text), `упрёк в тексте: ${rhythm.text}`);

  // Прерванная серия — тоже без упрёка, и рядом то, что осталось.
  const broken = buildReport(reportInput({ streak: computeStreak(["2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-22") }));
  const brokenRhythm = broken.sections.find((s) => s.title === "Ритм");
  assert.match(brokenRhythm.text, /так бывает/);
  assert.match(brokenRhythm.text, /Всего дней с записями: 3/);
});

test("килограммы везде записаны одинаково", () => {
  // Одно и то же число печаталось по-разному в соседних строках письма: в
  // блоке чисел «−0,4», в абзаце «-0.4». Для читателя это два разных числа.
  const report = buildReport(reportInput());
  const trend = report.highlights.find((h) => h.label.startsWith("тренд"));
  assert.equal(trend.value, "−0,4", "минус — настоящий, разделитель — запятая");

  const body = report.sections.find((s) => s.title === "Тело");
  assert.ok(body.text.includes("−0,4 кг"), `в тексте другое написание: ${body.text}`);
  assert.ok(!/-0\.4|-0,4/.test(body.text), "дефис вместо минуса или точка вместо запятой");

  const weight = report.highlights.find((h) => h.label.startsWith("вес"));
  assert.equal(weight.value, "78,4");
});

test("«из 31 дня», а не «из 31 дней»", () => {
  const march = buildReport(reportInput({
    period: previousMonth("2026-04-02"),
    dayStats: dayStats(Array.from({ length: 24 }, (_, i) => `2026-03-${String(i + 1).padStart(2, "0")}`)),
  }));
  assert.match(march.sections.find((s) => s.title === "Главное").text, /24 из 31 дня —/);

  const week = buildReport(reportInput());
  assert.match(week.sections.find((s) => s.title === "Главное").text, /5 из 7 дней[ —.]/);
});

test("про заморозки говорится словом и в нужном числе", () => {
  // Один пропуск.
  const one = buildReport(reportInput({
    streak: computeStreak(["2026-03-16", "2026-03-17", "2026-03-18", "2026-03-20"], "2026-03-21"),
  })).sections.find((s) => s.title === "Ритм");
  assert.match(one.text, /один пропуск закрыт заморозкой/, one.text);

  // Два подряд — предел.
  const two = buildReport(reportInput({
    streak: computeStreak(["2026-03-16", "2026-03-17", "2026-03-18"], "2026-03-21"),
  })).sections.find((s) => s.title === "Ритм");
  assert.match(two.text, /два пропуска закрыты заморозками/, two.text);

  // Ни одного — про заморозки ни слова. Серия здесь без разрывов: последний
  // день периода записан.
  const none = buildReport(reportInput({
    streak: computeStreak(["2026-03-18", "2026-03-19", "2026-03-20", "2026-03-21"], "2026-03-21"),
  })).sections.find((s) => s.title === "Ритм");
  assert.ok(!/заморозк/.test(none.text), `лишнее упоминание: ${none.text}`);
});

test("«Еда и вес» идёт последним разделом и только когда он есть", () => {
  const without = buildReport(reportInput());
  assert.ok(!without.sections.some((s) => s.title === "Еда и вес"));

  const impact = { title: "Еда и вес", text: "Наблюдение, а не вывод." };
  const with_ = buildReport(reportInput({ impact }));
  assert.equal(with_.sections.at(-1).title, "Еда и вес");
});

test("пустой период отправлять незачем", () => {
  const empty = buildReport(reportInput({ dayStats: [], streak: computeStreak([], "2026-03-22") }));
  assert.equal(isReportWorthSending(empty, MIN_DAYS.weekly), false);

  const thin = buildReport(reportInput({ dayStats: dayStats(["2026-03-16", "2026-03-17"]) }));
  assert.equal(isReportWorthSending(thin, MIN_DAYS.weekly), false, "два дня — это не отчёт, а пересказ двух дней");

  assert.equal(isReportWorthSending(buildReport(reportInput()), MIN_DAYS.weekly), true);
});

// ── Отправка ─────────────────────────────────────────────────────────────

const LINKS = {
  siteUrl: "https://jivoetelo.ru",
  settingsUrl: "https://jivoetelo.ru/app/settings",
  unsubscribePostUrl: "https://jivoetelo.ru/api/unsubscribe",
};

test("письмо содержит те же числа, что и сообщение бота", () => {
  const report = buildReport(reportInput());
  const email = renderReportEmail(report, "Алексей", LINKS);
  const telegram = renderReportTelegram(report, LINKS);

  for (const highlight of report.highlights) {
    assert.ok(email.text.includes(highlight.value), `в письме нет ${highlight.value}`);
    assert.ok(telegram.includes(highlight.value), `в сообщении нет ${highlight.value}`);
  }
  assert.match(email.subject, /Неделя: 16–22 марта/);
  assert.match(email.text, /^Алексей, вот ваш обзор\./);
});

test("в письме есть дорога к настройкам отчётов", () => {
  // Письмо без выхода — это письмо, от которого нельзя отписаться.
  const email = renderReportEmail(buildReport(reportInput()), null, LINKS);
  assert.ok(email.text.includes(LINKS.settingsUrl));
  assert.ok(email.html.includes(LINKS.settingsUrl));
});

test("разметка письма не ломается на кавычках в тексте", () => {
  const report = buildReport(reportInput({
    impact: { title: "Еда и вес", text: 'Блюдо «борщ» <не> "тег" & амперсанд' },
  }));
  const html = renderReportEmail(report, null, LINKS).html;
  assert.ok(html.includes("&lt;не&gt;"), "угловые скобки должны экранироваться");
  assert.ok(html.includes("&amp; амперсанд"));
});

test("сообщение бота влезает в ограничение Telegram", () => {
  const long = "Очень длинный раздел. ".repeat(400);
  const report = buildReport(reportInput({ impact: { title: "Еда и вес", text: long } }));
  const message = renderReportTelegram(report, LINKS);
  assert.ok(message.length < 4096, `сообщение длиной ${message.length} Telegram отвергнет целиком`);
  assert.ok(message.length > 200, "обрезать до пустоты тоже нельзя");
  // Теги должны остаться парными: незакрытый <b> Telegram не принимает.
  assert.equal((message.match(/<b>/g) ?? []).length, (message.match(/<\/b>/g) ?? []).length);
  assert.ok(TELEGRAM_LIMIT < 4096);
});

test("периоды выбираются по виду отчёта", () => {
  assert.deepEqual(periodFor("weekly", "2026-03-23"), previousWeek("2026-03-23"));
  assert.deepEqual(periodFor("monthly", "2026-03-23"), previousMonth("2026-03-23"));
});

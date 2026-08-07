import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCESS_ANCHOR, TARIFFS } from "../lib/paid.ts";
import { accessOffer, cheapestPayLink, payLinksFor } from "../lib/payments/access-links.ts";
import { parseRef } from "../lib/payments/tribute.ts";
import {
  planTrialWarning,
  TRIAL_WARNING_DAYS_BEFORE,
  TRIAL_WARNING_HOUR,
  trialWarningText,
} from "../lib/reminders.ts";
import { htmlProblem } from "../lib/bot/markup.ts";

/**
 * Кнопка оплаты в отказе и предупреждение о конце пробного месяца.
 *
 * Обе вещи про деньги, и обе — про момент. Кнопка должна появляться там, где
 * человек упёрся, и не появляться там, где он уже заплатил: предложение
 * купить купленное показывает, что сервис не знает, с кем разговаривает.
 */

const KEY = "тест-ключ";

function withPayments(run) {
  const before = {
    key: process.env.TRIBUTE_API_KEY,
    month: process.env.TRIBUTE_LINK_MONTH,
    year: process.env.TRIBUTE_LINK_YEAR,
    on: process.env.PAYMENTS_ENABLED,
  };
  process.env.TRIBUTE_API_KEY = KEY;
  process.env.TRIBUTE_LINK_MONTH = "https://web.tribute.tg/p/Bw2";
  process.env.TRIBUTE_LINK_YEAR = "https://web.tribute.tg/p/Bw4";
  process.env.PAYMENTS_ENABLED = "true";
  try {
    return run();
  } finally {
    for (const [name, value] of [
      ["TRIBUTE_API_KEY", before.key],
      ["TRIBUTE_LINK_MONTH", before.month],
      ["TRIBUTE_LINK_YEAR", before.year],
      ["PAYMENTS_ENABLED", before.on],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("ссылки собираются на все тарифы и несут метку человека", () => {
  const links = withPayments(() => payLinksFor(42));
  assert.equal(links?.length, TARIFFS.length);
  for (const link of links ?? []) {
    const ref = new URL(link.url).searchParams.get("ref");
    assert.equal(parseRef(ref, KEY), 42, `метка не читается обратно: ${link.url}`);
  }
});

test("подменённый номер в ссылке не проходит", () => {
  // Иначе достаточно поправить цифру в адресной строке, чтобы чужая оплата
  // засчиталась не тому.
  const link = withPayments(() => cheapestPayLink(42));
  const ref = new URL(link.url).searchParams.get("ref");
  assert.equal(parseRef(`43.${ref.split(".")[1]}`, KEY), null);
});

test("в отказе предлагается самый дешёвый вход", () => {
  const link = withPayments(() => cheapestPayLink(1));
  const cheapest = [...TARIFFS].sort((a, b) => a.priceRub - b.priceRub)[0];
  assert.equal(link.priceRub, cheapest.priceRub);
});

test("кнопка появляется только у отказа про доступ", () => {
  withPayments(() => {
    const offer = accessOffer({ allowed: false, reason: "no_access", operation: "analyze_photo" }, 7);
    assert.ok(offer, "закрытый доступ — единственный отказ, где человек готов платить");
    assert.match(offer.payLabel, /₽/);

    // Дневной лимит исчерпывает только тот, у кого доступ открыт.
    for (const denial of [
      { allowed: false, reason: "daily_limit", used: 100, limit: 100, operation: "analyze_photo", plan: "premium" },
      { allowed: false, reason: "too_fast" },
      { allowed: false, reason: "service_budget" },
    ]) {
      assert.equal(accessOffer(denial, 7), undefined, denial.reason);
    }
  });
});

test("выключенный приём денег даёт null, а не кнопку в никуда", () => {
  const before = process.env.PAYMENTS_ENABLED;
  delete process.env.PAYMENTS_ENABLED;
  try {
    const offer = accessOffer({ allowed: false, reason: "no_access", operation: "analyze_photo" }, 7);
    assert.equal(offer, null, "null и undefined тут значат разное: экран показывает разное");
  } finally {
    if (before === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = before;
  }
});

test("якорь один на весь код и годится для адреса", () => {
  assert.match(ACCESS_ANCHOR, /^[a-z-]+$/, "кириллица в якоре превращается в проценты в адресной строке");
});

const BASE = { localHour: TRIAL_WARNING_HOUR, enabled: true, paid: false, warned: false, until: "5 сентября" };

test("предупреждение уходит за три дня и ровно один раз", () => {
  for (let daysLeft = 1; daysLeft <= TRIAL_WARNING_DAYS_BEFORE; daysLeft += 1) {
    assert.ok(planTrialWarning({ ...BASE, daysLeft }), `${daysLeft} дн. до конца — молчим`);
  }
  assert.equal(planTrialWarning({ ...BASE, daysLeft: TRIAL_WARNING_DAYS_BEFORE + 1 }), null, "рано");
  assert.equal(planTrialWarning({ ...BASE, daysLeft: 2, warned: true }), null, "второе за тот же месяц");
});

test("заплатившему и тому, у кого доступ уже закрыт, не пишем", () => {
  assert.equal(planTrialWarning({ ...BASE, daysLeft: 2, paid: true }), null, "он уже заплатил");
  // Закрылся — человек это увидел отказом; догонять его письмом поздно и
  // выглядит как злорадство.
  assert.equal(planTrialWarning({ ...BASE, daysLeft: 0 }), null);
  assert.equal(planTrialWarning({ ...BASE, daysLeft: -5 }), null);
});

test("выключенные напоминания уважаются", () => {
  // Человек нажал /stop. Считать, что запрет не касается наших сообщений про
  // деньги, — ровно тот приём, за который мессенджеры и не любят.
  assert.equal(planTrialWarning({ ...BASE, daysLeft: 2, enabled: false }), null);
});

test("ночью и ранним утром молчим", () => {
  for (const localHour of [0, 4, 9, 11, TRIAL_WARNING_HOUR + 3, 23]) {
    assert.equal(planTrialWarning({ ...BASE, daysLeft: 2, localHour }), null, `час ${localHour}`);
  }
});

test("текст называет дату, что останется и оба выхода", () => {
  const text = trialWarningText(3, "5 сентября");
  assert.equal(htmlProblem(text), null);
  assert.ok(text.includes("5 сентября"), "без даты предупреждение не предупреждение");
  assert.ok(/дневник/i.test(text), "человек в первую очередь боится потерять записи");
  assert.ok(text.includes("/invite"), "второй выход бесплатный, умалчивать о нём нечестно");

  // «Завтра» вместо «через 1 дн.» — иначе фраза читается как машинная.
  assert.ok(trialWarningText(1, "5 сентября").includes("завтра"));
  assert.ok(!trialWarningText(1, "5 сентября").includes("через 1"));
});

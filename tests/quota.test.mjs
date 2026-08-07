import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_OPERATIONS,
  estimateCostUsd,
  normalizePlan,
  OPERATION_LABELS,
  PLAN_LIMITS,
  quotaMessage,
} from "../lib/quota-policy.ts";
import {
  daysLeft,
  effectivePlan,
  extendAccess,
  hasPaidAccess,
  TRIAL_DAYS,
} from "../lib/paid.ts";
import { REFERRAL_REWARD_AFTER_DAYS, REFERRAL_REWARD_DAYS } from "../lib/referral.ts";

/**
 * Что этот тест сторожил раньше и почему теперь сторожит другое.
 *
 * История правок здесь важнее самих чисел, потому что каждый раз менялась
 * политика, а не значение:
 *
 *  1. «Бесплатный тариф покрывает реальный день с большим запасом» —
 *     15 разборов по фото, 30 по тексту. Проверка политики «лимиты не
 *     монетизация».
 *  2. «Бесплатного тарифа хватает записать день целиком» — не меньше трёх
 *     приёмов пищи. Проверка политики «бесплатный тариф — знакомство».
 *  3. Сейчас бесплатного тарифа нет вовсе. `PLAN_LIMITS.free` описывает
 *     закрытый доступ, и требовать от него хоть одного разбора значило бы
 *     требовать, чтобы пробный месяц не кончался.
 *
 * Соблазн на третьем шаге — просто удалить обе проверки. Так делать нельзя:
 * тогда никто не заметит, если однажды нули уедут в `premium` или пробный
 * период тихо станет неделей. Поэтому проверки не удалены, а переписаны на
 * то, что теперь действительно обязано выполняться.
 */
test("закрытый доступ означает ноль обращений, а не маленький лимит", () => {
  // Полумера — «оставим два разбора в сутки» — худший из вариантов: её не
  // хватает вести дневник и хватает не решать. Если однажды кто-то захочет
  // вернуть остаточный лимит, это должно быть отдельным решением с правкой
  // оферты, а не тихой заменой нуля на двойку.
  for (const operation of AI_OPERATIONS) {
    assert.equal(
      PLAN_LIMITS.free[operation],
      0,
      `${operation}: доступ закрыт, а обращения остались — граница проведена наполовину`,
    );
  }
});

/**
 * Главный запрет новой модели.
 *
 * Мы обещаем — на главной, в оферте разделом «Что доступно всегда», в
 * lib/paid.ts и lib/quota-policy.ts, — что платным становится обращение к
 * модели, а не дневник. Ноль в `PLAN_LIMITS` допустим ровно потому, что эта
 * таблица описывает только обращения к модели: в ней нет и не должно быть
 * ни записи еды руками, ни чтения истории, ни выгрузки.
 *
 * Проверка держит именно это: список операций закрыт. Появление в нём
 * операции вроде `read_diary` или `export_data` сделало бы ноль выше
 * запретом на доступ человека к собственным записям — и сломало бы обещание
 * молча, не тронув ни одной строки текста.
 */
test("за деньги — только работа модели, дневник в этой таблице не участвует", () => {
  const MODEL_ONLY = ["analyze_photo", "analyze_text", "suggest", "read_scale", "transcribe"];
  assert.deepEqual(
    [...AI_OPERATIONS].sort(),
    [...MODEL_ONLY].sort(),
    "в платный контур попало что-то, кроме обращений к модели",
  );
});

/**
 * Пробный период — обещание, напечатанное в оферте числом из этого файла.
 *
 * Оферта (app/legal/tarify) берёт `TRIAL_DAYS` из кода, а не переписывает
 * его руками, — расхождение публичного документа с поведением сервиса это
 * не опечатка, а неисполненное обязательство. Тест закрывает вторую
 * половину той же дороги: правку числа в коде, после которой оферта молча
 * начнёт обещать другое.
 */
test("пробный период — месяц, и столько же даёт приглашение", () => {
  assert.equal(TRIAL_DAYS, 30, "месяц — это то, что обещано на главной и в оферте");
  assert.equal(
    REFERRAL_REWARD_DAYS,
    TRIAL_DAYS,
    "приглашение обещано «на месяц» теми же словами — числа обязаны совпадать",
  );
  assert.ok(REFERRAL_REWARD_AFTER_DAYS > 0, "награда за нажатие на ссылку — это накрутка ботами");
});

/**
 * Доступ открыт двумя разными способами, и различать их обязательно.
 *
 * Сказать «у вас платный доступ» тому, кто идёт по пробному месяцу, значит
 * пообещать списание, которого не было; через месяц «доступ закончился»
 * прочитается как обман. Экраны различают состояния по `hasPaidAccess` и
 * `inTrial` — проверяем, что различать есть чем.
 */
test("пробный месяц и оплата — разные состояния, а не одно", () => {
  const created = new Date("2026-08-01T00:00:00Z");
  const day10 = new Date("2026-08-11T00:00:00Z");
  const day40 = new Date("2026-09-10T00:00:00Z");

  assert.equal(effectivePlan(null, created, day10), "premium", "пробный месяц открывает доступ");
  assert.equal(hasPaidAccess(null, day10), false, "но платным он не является");
  assert.equal(effectivePlan(null, created, day40), "free", "через месяц доступ закрыт");

  const paidUntil = new Date("2026-10-01T00:00:00Z");
  assert.equal(effectivePlan(paidUntil, created, day40), "premium", "оплата открывает после пробного");
  assert.equal(hasPaidAccess(paidUntil, day40), true);
});

/**
 * Награда за приглашение не должна уменьшать доступ.
 *
 * Начисление приходит на седьмой день записей, то есть заведомо внутри
 * пробного месяца. Если считать месяц «от сейчас», двадцать три оставшихся
 * дня пробного периода сгорают молча: вместо шестидесяти дней выходит
 * тридцать семь. Ровно тот случай, когда подарок отнимает.
 */
test("месяц за приглашение прибавляется к пробному, а не съедает его остаток", () => {
  const created = new Date("2026-08-01T00:00:00Z");
  const day7 = new Date("2026-08-08T00:00:00Z");
  const granted = extendAccess(null, created, REFERRAL_REWARD_DAYS, day7);

  // Пробный месяц кончается 31 августа; месяц сверху — это 30 сентября.
  assert.equal(granted.toISOString().slice(0, 10), "2026-09-30");
  assert.ok(
    daysLeft(granted, created, day7) >= 53,
    `осталось ${daysLeft(granted, created, day7)} дн. — остаток пробного месяца потерян`,
  );
});

test("продление заранее не сжигает остаток оплаченного срока", () => {
  const created = new Date("2026-01-01T00:00:00Z");
  const now = new Date("2026-06-01T00:00:00Z");
  const paidUntil = new Date("2026-06-20T00:00:00Z");
  const extended = extendAccess(paidUntil, created, 30, now);
  assert.equal(extended.toISOString().slice(0, 10), "2026-07-20");
});

test("расшифровка речи считается, но денег не стоит", () => {
  // Своя установка на нашем же сервере: наружу не уходит ни токена. Лимит ей
  // всё равно нужен — точка приёма мегабайтных файлов без ограничения
  // частоты занимает сервер целиком.
  assert.equal(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, "transcribe"), 0);
  // Лимит смотрим у открытого доступа: у закрытого он ноль, как и у всего
  // остального, и «ноль расшифровок» ничего не сказал бы про цену.
  assert.ok(PLAN_LIMITS.premium.transcribe > 0, `расшифровок: ${PLAN_LIMITS.premium.transcribe}`);
  assert.equal(typeof OPERATION_LABELS.transcribe, "string");
});

test("у каждой считаемой операции есть подпись и лимит", () => {
  // Список берётся из AI_OPERATIONS, а не из самих таблиц: раньше они
  // сверялись друг с другом, и операция, забытая в обеих сразу, проходила
  // молча. Именно так чуть не уехало чтение весов — новая операция требует
  // записи в четырёх таблицах, и «забыл везде» выглядит как «всё сходится».
  for (const operation of AI_OPERATIONS) {
    assert.equal(typeof PLAN_LIMITS.free[operation], "number", `нет лимита для ${operation}`);
    assert.equal(typeof OPERATION_LABELS[operation], "string", `нет подписи для ${operation}`);
  }
  assert.equal(Object.keys(OPERATION_LABELS).length, AI_OPERATIONS.length, "в подписях есть лишнее");
  assert.equal(Object.keys(PLAN_LIMITS.free).length, AI_OPERATIONS.length, "в лимитах есть лишнее");
});

test("у каждой операции своя ставка, а не запасная", () => {
  // Забытая цена не ломает ничего заметного: предохранитель просто начинает
  // считать по самой дорогой ставке и обрубает разбор раньше времени.
  // Ровно это уже случалось, когда на всё стояла одна ставка Opus.
  const MILLION = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
  const fallback = estimateCostUsd(MILLION, undefined);
  for (const operation of AI_OPERATIONS) {
    if (operation === "transcribe") continue; // Своя установка, цена честный ноль.
    assert.notEqual(
      estimateCostUsd(MILLION, operation),
      fallback,
      `${operation} считается по запасной ставке — цены для него нет`,
    );
  }
});

test("открытый доступ не уже закрытого", () => {
  // Тавтология при нулях слева — и пусть: проверка стоит на случай, если
  // кто-то однажды вернёт остаточный лимит закрытому доступу, забыв, что
  // открытый обязан быть не меньше.
  for (const key of Object.keys(PLAN_LIMITS.free)) {
    assert.ok(
      PLAN_LIMITS.premium[key] >= PLAN_LIMITS.free[key],
      `premium.${key} не должен быть меньше free`,
    );
  }
});

test("normalizePlan защищает от мусора в базе", () => {
  assert.equal(normalizePlan("premium"), "premium");
  assert.equal(normalizePlan("free"), "free");
  assert.equal(normalizePlan(null), "free");
  assert.equal(normalizePlan("enterprise-ultra"), "free");
});

test("оценка стоимости считается по ценам модели", () => {
  // 1M входных = $5, 1M выходных = $25
  assert.equal(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 0 }), 5);
  assert.equal(estimateCostUsd({ inputTokens: 0, outputTokens: 1_000_000 }), 25);
  const meal = estimateCostUsd({ inputTokens: 1800, outputTokens: 380 });
  assert.ok(meal > 0 && meal < 0.05, `разбор фото должен стоить копейки, вышло ${meal}`);
});

test("сообщения об отказе поддерживающие и без обвинений", () => {
  const messages = [
    quotaMessage({ allowed: false, reason: "too_fast" }),
    quotaMessage({ allowed: false, reason: "daily_limit", used: 20, limit: 20, operation: "analyze_photo" }),
    quotaMessage({ allowed: false, reason: "no_access", operation: "analyze_photo" }),
    quotaMessage({ allowed: false, reason: "service_budget" }),
  ];
  for (const message of messages) {
    assert.ok(message.length > 20, "сообщение должно объяснять ситуацию");
    for (const forbidden of ["злоупотреб", "слишком много", "нельзя", "запрещ", "превысили", "исчерпали лимит доверия"]) {
      assert.ok(!message.toLowerCase().includes(forbidden), `нашли «${forbidden}» в: ${message}`);
    }
  }
});

test("сообщение о дневном лимите называет число и подсказывает выход", () => {
  const message = quotaMessage({
    allowed: false, reason: "daily_limit", used: 20, limit: 20, operation: "analyze_photo",
  });
  assert.match(message, /20/);
  assert.match(message, /вручную/, "должен остаться бесплатный путь без AI");
  assert.match(message, new RegExp(OPERATION_LABELS.analyze_photo));
});

/**
 * Предохранитель считает деньги, а операции обслуживают разные модели. Пока
 * ставка была одна на всё, дневной потолок срабатывал впятеро раньше, чем
 * тратились настоящие деньги, — и съедал ровно ту экономию, ради которой
 * модели и разводились по задачам.
 */
test("расход считается по ставке той модели, что обслуживает операцию", () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
  const photo = estimateCostUsd(usage, "analyze_photo");
  const text = estimateCostUsd(usage, "analyze_text");
  const suggest = estimateCostUsd(usage, "suggest");

  assert.ok(photo > text, `разбор фото дороже текстового: ${photo} против ${text}`);
  assert.equal(text, suggest, "текст и подсказки на одной модели");
  // Без операции — самая дорогая ставка: завысить безопаснее, чем занизить.
  assert.ok(estimateCostUsd(usage) >= photo, "умолчание не должно быть дешевле любой известной операции");
});

test("оптимизация моделей действительно расширяет дневной потолок", () => {
  // Типовой разбор фото после сжатия снимка.
  const meal = { inputTokens: 1900, outputTokens: 400 };
  const before = estimateCostUsd(meal); // как считалось раньше — по Opus
  const after = estimateCostUsd(meal, "analyze_photo");
  assert.ok(after < before * 0.7, `экономия должна быть заметной: было ${before}, стало ${after}`);
  // Прейскурантные ставки Sonnet, без вводной скидки: около 250 разборов в
  // сутки против полутора сотен на Opus. Со скидкой до 31 августа — заметно больше.
  assert.ok(3 / after > 240, `при потолке $3 должно выходить больше 240 разборов, вышло ${Math.floor(3 / after)}`);
});

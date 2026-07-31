import test from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_KINDS,
  CONSENT_LABELS,
  isConsentKind,
  LEGAL_PAGES,
  LEGAL_UPDATED_AT,
  LEGAL_VERSION,
  NOT_MEDICAL_DISCLAIMER,
} from "../lib/legal.ts";
import { operatorDetails } from "../lib/legal-operator.ts";

test("у каждого вида согласия есть человеческая подпись", () => {
  for (const kind of CONSENT_KINDS) {
    const label = CONSENT_LABELS[kind];
    assert.ok(label, `нет подписи для ${kind}`);
    // Подпись показывается пользователю в настройках: не «terms», а по-русски.
    assert.ok(/[а-яё]/i.test(label), `подпись для ${kind} не на русском: ${label}`);
  }
});

test("isConsentKind не пропускает мусор из базы", () => {
  assert.equal(isConsentKind("terms"), true);
  assert.equal(isConsentKind("ai_processing"), true);
  assert.equal(isConsentKind("выдумка"), false);
  assert.equal(isConsentKind(""), false);
});

test("версия и дата документов заданы в машиночитаемом виде", () => {
  // Версия сохраняется в базу вместе с согласием — она должна быть стабильной
  // строкой, а не датой сборки.
  assert.match(LEGAL_VERSION, /^\d+\.\d+$/);
  assert.match(LEGAL_UPDATED_AT, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!Number.isNaN(Date.parse(`${LEGAL_UPDATED_AT}T00:00:00Z`)));
});

test("дисклеймер прямо говорит, что сервис не медицинский", () => {
  assert.match(NOT_MEDICAL_DISCLAIMER, /не медицинское изделие/i);
  assert.match(NOT_MEDICAL_DISCLAIMER, /не заменяет|не ставит диагнозы/i);
  // Правила языка из раздела 4.3: никаких обещаний лечения и оценок.
  for (const forbidden of ["вылеч", "гарантиру", "похудеет", "вредн"]) {
    assert.ok(!NOT_MEDICAL_DISCLAIMER.toLowerCase().includes(forbidden), `запрещённое слово: ${forbidden}`);
  }
});

test("все юридические страницы ведут внутрь /legal и имеют заголовок", () => {
  assert.ok(LEGAL_PAGES.length >= 4);
  for (const page of LEGAL_PAGES) {
    assert.match(page.href, /^\/legal\/[a-z]+$/);
    assert.ok(page.title.length > 5, `слишком короткий заголовок: ${page.title}`);
  }
  const hrefs = LEGAL_PAGES.map((page) => page.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "дублирующиеся ссылки");
});

test("без реквизитов в окружении документы честно признаются в этом", () => {
  const saved = { ...process.env };
  for (const key of ["LEGAL_OPERATOR_NAME", "LEGAL_OPERATOR_INN", "LEGAL_OPERATOR_OGRN", "LEGAL_OPERATOR_ADDRESS", "LEGAL_CONTACT_EMAIL"]) {
    delete process.env[key];
  }
  try {
    const operator = operatorDetails();
    assert.equal(operator.filled, false);
    // Главное: никаких выдуманных ИНН на публичной странице.
    assert.match(operator.name, /будет указано/i);
    assert.match(operator.inn, /будет указано/i);
    assert.match(operator.email, /@jivoetelo\.ru$/);
  } finally {
    Object.assign(process.env, saved);
  }
});

test("реквизиты из окружения подставляются как есть", () => {
  const saved = { ...process.env };
  process.env.LEGAL_OPERATOR_NAME = "ИП Иванов Иван Иванович";
  process.env.LEGAL_OPERATOR_INN = "770123456789";
  process.env.LEGAL_OPERATOR_OGRN = "321770000123456";
  process.env.LEGAL_OPERATOR_ADDRESS = "г. Москва, ул. Примерная, д. 1";
  process.env.LEGAL_CONTACT_EMAIL = "  privacy@jivoetelo.ru  ";
  try {
    const operator = operatorDetails();
    assert.equal(operator.filled, true);
    assert.equal(operator.name, "ИП Иванов Иван Иванович");
    assert.equal(operator.inn, "770123456789");
    assert.equal(operator.email, "privacy@jivoetelo.ru", "пробелы должны срезаться");
  } finally {
    process.env = saved;
  }
});

test("документы и расчёт сходятся в возрасте", async () => {
  // Пока документы требовали 18+, а расчёт работал с 14 лет и имел отдельную
  // ветку для подростков, продукт публично обещал одно, а делал другое. Это
  // нашёл разбор рисков, и это ровно тот класс расхождений, который сам себя
  // не проявляет: обе стороны по отдельности выглядят разумно.
  const { readFile } = await import("node:fs/promises");
  const { MIN_AGE, ADULT_AGE } = await import("../lib/onboarding.ts");

  assert.equal(MIN_AGE, 14, "нижняя граница расчёта");
  assert.equal(ADULT_AGE, 18, "граница, ниже которой дефицит не считаем");

  for (const page of ["terms", "privacy", "consent"]) {
    const text = await readFile(new URL(`../app/legal/${page}/page.tsx`, import.meta.url), "utf8");
    assert.match(text, new RegExp(`${MIN_AGE} лет`), `${page}: нижняя граница возраста не названа`);
    assert.doesNotMatch(
      text,
      /(старше|достигшим возраста) 18 лет/,
      `${page}: документ всё ещё требует 18 лет, хотя расчёт работает с ${MIN_AGE}`,
    );
  }
});

test("подросток не получает дефицит ни при каких ответах", async () => {
  // То же ограничение, но проверенное со стороны кода, а не текста: документы
  // теперь это обещают, и обещание должно быть исполнимым.
  const { effectiveGoal } = await import("../lib/onboarding.ts");
  for (const relationship of ["calm", "tense", "hard"]) {
    const goal = effectiveGoal({ goal: "lose", birthYear: 2010, relationship }, 2026);
    assert.equal(goal, "maintain", `16 лет, отношения «${relationship}» — дефицит просочился`);
  }
  assert.equal(effectiveGoal({ goal: "lose", birthYear: 2007, relationship: "calm" }, 2026), "lose");
});

test("в Метрику не уходит ничего, кроме имени цели", async () => {
  // Мы обещали не передавать сведения о питании и теле третьим лицам.
  // reachGoal принимает только идентификатор из закрытого списка, и это
  // единственное, что физически может уехать в счётчик.
  const { ALL_GOALS } = await import("../lib/goals.ts");
  for (const goal of ALL_GOALS) {
    assert.match(goal, /^[a-z_]+$/, `${goal}: идентификатор цели должен быть простым именем`);
  }
  assert.equal(new Set(ALL_GOALS).size, ALL_GOALS.length, "повторов среди целей быть не должно");
});

test("reachGoal молчит там, где счётчика нет", async () => {
  // Mini App, разработка и e2e-прогоны идут без счётчика. Аналитика не тот
  // повод, ради которого стоит уронить экран.
  const { reachGoal, GOAL_MEAL_SAVED } = await import("../lib/goals.ts");
  assert.doesNotThrow(() => reachGoal(GOAL_MEAL_SAVED));
});

test("в счётчик уходит ровно тот вызов, который просит Метрика", async () => {
  // Метрика при создании цели показывает готовую строку вида
  //   ym(111149990,'reachGoal','plan_done')
  // и предлагает вставить её в код. Вставлять ничего не нужно: reachGoal
  // собирает такой вызов сам. Тест это фиксирует, чтобы «а точно ли шлётся»
  // не приходилось выяснять заново.
  const saved = globalThis.window;
  const calls = [];
  globalThis.window = { ym: (...args) => calls.push(args), __ymCounterId: 111149990 };
  try {
    const { reachGoal, GOAL_PLAN_DONE } = await import("../lib/goals.ts");
    reachGoal(GOAL_PLAN_DONE);
    assert.deepEqual(calls, [[111149990, "reachGoal", "plan_done"]]);
  } finally {
    if (saved === undefined) delete globalThis.window;
    else globalThis.window = saved;
  }
});

test("номер счётчика в коде целей и в самом счётчике — один", async () => {
  // reachGoal берёт номер из window.__ymCounterId, а его выставляет сниппет
  // в app/metrika.tsx. Если однажды кто-то поменяет счётчик, поменять надо
  // будет ровно одно место — тест следит, чтобы второго не завелось.
  const { readFile } = await import("node:fs/promises");
  const metrika = await readFile(new URL("../app/metrika.tsx", import.meta.url), "utf8");
  const declared = metrika.match(/const COUNTER_ID = (\d+);/)?.[1];
  assert.ok(declared, "номер счётчика должен объявляться константой");
  assert.match(metrika, /window\.__ymCounterId = \$\{COUNTER_ID\};/, "номер должен передаваться из той же константы");

  const goals = await readFile(new URL("../lib/goals.ts", import.meta.url), "utf8");
  assert.doesNotMatch(goals, /\d{6,}/, "в lib/goals.ts номера счётчика быть не должно — только чтение из окна");
});

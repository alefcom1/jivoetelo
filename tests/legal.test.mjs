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

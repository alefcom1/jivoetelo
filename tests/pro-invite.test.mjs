import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkInvite,
  createInviteCode,
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_TTL_MS,
  normalizeInviteCode,
  UNBIASED_LIMIT,
} from "../lib/pro/invite.ts";

const NOW = new Date("2026-08-11T12:00:00Z");

/** Предсказуемый «случайный» источник: тесты не должны зависеть от удачи. */
function bytes(values) {
  let i = 0;
  return (size) => {
    const out = new Uint8Array(size);
    for (let k = 0; k < size; k += 1) {
      out[k] = values[i % values.length];
      i += 1;
    }
    return out;
  };
}

test("код нужной длины и живёт час", () => {
  const { code, expiresAt } = createInviteCode(NOW, bytes([0, 1, 2, 3, 4, 5, 6, 7]));
  assert.equal(code.length, INVITE_CODE_LENGTH);
  assert.equal(expiresAt.getTime() - NOW.getTime(), INVITE_TTL_MS);
});

test("из пары похожих знаков в алфавите остаётся не больше одного", () => {
  // Инвариант именно такой, а не «нет цифры 8»: держать 8 можно ровно потому,
  // что нет B. Код произносят вслух и пересылают сообщением, и цена путаницы
  // здесь не «не подошёл», а «подошёл к чужому приглашению».
  const CONFUSABLE = [
    ["0", "O"], ["0", "Q"], ["1", "I"], ["1", "L"], ["I", "L"],
    ["5", "S"], ["8", "B"], ["2", "Z"], ["U", "V"],
  ];
  for (const [a, b] of CONFUSABLE) {
    const both = INVITE_ALPHABET.includes(a) && INVITE_ALPHABET.includes(b);
    assert.ok(!both, `${a} и ${b} вместе в алфавите — их спутают при диктовке`);
  }
  assert.equal(new Set(INVITE_ALPHABET).size, INVITE_ALPHABET.length, "повторов в алфавите быть не должно");
});

test("код собирается только из знаков алфавита", () => {
  const seen = new Set();
  for (let start = 0; start < UNBIASED_LIMIT; start += 1) {
    for (const char of createInviteCode(NOW, bytes([start])).code) seen.add(char);
  }
  assert.equal(seen.size, INVITE_ALPHABET.length, "должен встретиться каждый знак алфавита и ни одного лишнего");
  for (const char of seen) assert.ok(INVITE_ALPHABET.includes(char), `посторонний знак ${char}`);
});

test("вырожденный источник случайности приводит к ошибке, а не к зависанию", () => {
  // Цикл выбора управляется чужой функцией. Источник, отдающий только
  // отбрасываемые значения, раньше вешал бы процесс молча — а виснущий
  // сервер отлаживают дольше, чем падающий. Тест нашёл это до боя.
  assert.throws(() => createInviteCode(NOW, bytes([255])), /источник случайности/);
});

test("байты вне ровного диапазона пропускаются, а не загибаются в начало алфавита", () => {
  // Без отбрасывания «хвоста» первые знаки алфавита выпадали бы чаще
  // остальных, и перебор дешевел бы ровно на эту неравномерность.
  // 255 при 26-буквенном алфавите — как раз из хвоста: он обязан быть пропущен.
  const code = createInviteCode(NOW, bytes([255, 255, 255, 0])).code;
  assert.equal(code.length, INVITE_CODE_LENGTH);
  assert.equal(new Set(code).size, 1, "все знаки должны прийти из одного допустимого байта");
});

test("код нормализуется из того вида, в каком его диктуют", () => {
  const { code } = createInviteCode(NOW, bytes([0, 1, 2, 3, 4, 5, 6, 7]));
  assert.equal(normalizeInviteCode(code.toLowerCase()), code);
  assert.equal(normalizeInviteCode(` ${code.slice(0, 4)}-${code.slice(4)} `), code);
});

test("похожие знаки молча не подменяются", () => {
  // Соблазн «заменить 0 на O» велик, но молчаливое исправление ввода в
  // механизме доступа к чужим данным — плохой обмен.
  assert.equal(normalizeInviteCode("0CDEFGHJ"), null);
  assert.equal(normalizeInviteCode("ACDEFGH1"), null);
});

test("неверная длина и посторонние знаки отвергаются", () => {
  assert.equal(normalizeInviteCode(""), null);
  assert.equal(normalizeInviteCode("ACDEFGH"), null);
  assert.equal(normalizeInviteCode("ACDEFGHJK"), null);
  assert.equal(normalizeInviteCode("ACDE FGHJ K"), null);
  assert.equal(normalizeInviteCode("ACDE@GHJ"), null);
  assert.equal(normalizeInviteCode("АCDEFGHJ"), null, "кириллическая А похожа на латинскую, но это другой знак");
});

function invite(overrides = {}) {
  return {
    code: "ACDEFGHJ",
    specialistUserId: 1,
    expiresAt: new Date(NOW.getTime() + 60_000),
    usedAt: null,
    ...overrides,
  };
}

test("годное приглашение принимается", () => {
  assert.deepEqual(checkInvite(invite(), 2, NOW), { valid: true });
});

test("несуществующее, использованное и истёкшее приглашение не проходят", () => {
  assert.deepEqual(checkInvite(null, 2, NOW), { valid: false, reason: "not_found" });
  assert.deepEqual(checkInvite(invite({ usedAt: NOW }), 2, NOW), { valid: false, reason: "used" });
  assert.deepEqual(
    checkInvite(invite({ expiresAt: new Date(NOW.getTime() - 1) }), 2, NOW),
    { valid: false, reason: "expired" },
  );
});

test("код гаснет ровно в свою секунду", () => {
  assert.deepEqual(checkInvite(invite({ expiresAt: NOW }), 2, NOW), { valid: false, reason: "expired" });
});

test("использованный код не оживает от того, что срок ещё не вышел", () => {
  // Порядок проверок важен: одноразовость сильнее срока.
  const used = invite({ usedAt: new Date(NOW.getTime() - 1000), expiresAt: new Date(NOW.getTime() + 60_000) });
  assert.deepEqual(checkInvite(used, 2, NOW), { valid: false, reason: "used" });
});

test("специалист не приглашает сам себя", () => {
  assert.deepEqual(checkInvite(invite({ specialistUserId: 2 }), 2, NOW), { valid: false, reason: "self" });
});

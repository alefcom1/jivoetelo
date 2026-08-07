import test from "node:test";
import assert from "node:assert/strict";
import { awardText, inviteText, telegramShareLink } from "../lib/share-text.ts";
import { AWARDS } from "../lib/awards.ts";
import { referralLink } from "../lib/referral.ts";

/**
 * Тексты, уходящие наружу.
 *
 * Это единственное, что человек показывает другим людям, — и единственное,
 * что читают те, кто про сервис ничего не знает. Ошибка здесь стоит дороже
 * ошибки на экране: экран можно поправить, отправленное сообщение нет.
 */

test("в приглашении есть ссылка с кодом, без кода — обычный адрес", () => {
  assert.ok(inviteText("abcdefgh").includes(referralLink("abcdefgh")));
  assert.ok(inviteText(null).includes("jivoetelo.ru"));
});

test("карточка награды называет факт, а не обещание", () => {
  const text = awardText("30 дней наблюдений за своим питанием", "abcdefgh");
  assert.ok(text.includes("30 дней наблюдений"));
  assert.ok(text.includes(referralLink("abcdefgh")));
});

test("наружу не уходит ни слова про килограммы — на всех наградах разом", () => {
  const FORBIDDEN = [/кг\b/i, /килограмм/i, /похуд/i, /сброс/i, /−\d/, /-\d+ ?кг/i];
  for (const award of AWARDS) {
    const text = awardText(award.share, "abcdefgh");
    for (const bad of FORBIDDEN) assert.ok(!bad.test(text), `«${text}» нарушает ${bad}`);
  }
});

test("это сообщение от человека, а не рассылка", () => {
  // Его отправляют друзьям. «Присоединяйтесь» и «попробуйте бесплатно»
  // превращают личное сообщение в пересланную рекламу — и его перестают
  // отправлять вовсе.
  const FORBIDDEN = [/присоединяйтесь/i, /попробуйте/i, /скидк/i, /акци[яи]/i, /жми/i, /переходи по ссылке/i];
  const texts = [inviteText("abcdefgh"), awardText(AWARDS[0].share, "abcdefgh")];
  for (const text of texts) {
    for (const bad of FORBIDDEN) assert.ok(!bad.test(text), `«${text}» нарушает ${bad}`);
    assert.ok(!text.includes("!"), `«${text}» — восклицание`);
  }
});

test("сообщение короткое: его читают в списке чатов", () => {
  for (const text of [inviteText("abcdefgh"), awardText(AWARDS[0].share, "abcdefgh")]) {
    assert.ok(text.length <= 220, `${text.length} символов — длинно для пересылки`);
    assert.equal(text.split("\n").length, 3, "три строки: факт, что это, ссылка");
  }
});

test("ссылка уходит отдельным параметром, а не внутри текста", () => {
  // Иначе клиент не показывает превью и ломает переносы строк в сообщении.
  const text = inviteText("abcdefgh");
  const link = telegramShareLink(text);
  assert.ok(link.startsWith("https://t.me/share/url?url="));
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get("url"), referralLink("abcdefgh"));
  assert.ok(!parsed.searchParams.get("text").includes("t.me/"), "ссылка задвоилась в теле");
});

test("текст в ссылке пересылки экранирован", () => {
  const link = telegramShareLink("строка с & и ?\nhttps://example.test");
  const parsed = new URL(link);
  assert.equal(parsed.searchParams.get("text"), "строка с & и ?");
  assert.equal(parsed.searchParams.get("url"), "https://example.test");
});

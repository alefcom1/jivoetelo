import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Контраст токенов цвета по WCAG.
 *
 * Замер живого экрана делается браузером и вручную; здесь сторожатся сами
 * токены. Смысл в том, что приглушённый серый и коралловый — это не «оттенок
 * по вкусу», а значения, подобранные под пороги: подвинь их на полтона, и
 * подписи колонок подвала на каждой странице сайта уйдут под норму, а
 * заметить это можно будет только новым замером.
 *
 * До правки под нормой было 115 элементов на тринадцати публичных страницах —
 * заголовки колонок подвала, подписи шагов на главной, описания под
 * заголовками блоков.
 */

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** Значение токена из :root. */
function token(name) {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(CSS);
  assert.ok(match, `токен --${name} не найден в :root`);
  return match[1];
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Фоны, на которых бывает текст сайта, и действующий на них --muted. */
const BACKGROUNDS = {
  "бумага": { bg: () => token("paper"), muted: () => token("muted") },
  "белый": { bg: () => token("white"), muted: () => token("muted") },
  // Блок «Принципы» темнее бумаги, и общий --muted на нём не дотягивает —
  // поэтому там токен переопределён на самом блоке. Тот же приём, что с
  // коралловым на тёмных блоках: правится фон, а не каждое правило.
  "серый блок": { bg: () => "#deded4", muted: () => blockToken("principles", "muted") },
};

/** Значение токена, переопределённого на конкретном блоке. */
function blockToken(cls, name) {
  const match = new RegExp(`\\.${cls}\\{--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(CSS);
  assert.ok(match, `на .${cls} нет переопределения --${name}`);
  return match[1];
}

test("приглушённый текст читается на всех светлых фонах", () => {
  for (const [name, { bg, muted }] of Object.entries(BACKGROUNDS)) {
    const value = ratio(muted(), bg());
    assert.ok(value >= 4.5, `--muted (${muted()}) на «${name}»: ${value.toFixed(2)} при норме 4,5`);
  }
});

test("коралловый текст читается на всех светлых фонах", () => {
  // Отдельный токен от --coral не для красоты: фирменный коралловый даёт на
  // белом 3,13, и как текст он не проходит. Заливки, обводки и accent-color
  // остаются фирменными — к ним требования контраста не относятся.
  const coralText = token("coral-text");
  for (const [name, { bg }] of Object.entries(BACKGROUNDS)) {
    const value = ratio(coralText, bg());
    assert.ok(value >= 4.5, `--coral-text (${coralText}) на «${name}»: ${value.toFixed(2)} при норме 4,5`);
  }
});

test("на тёмных блоках коралловый возвращается к фирменному", () => {
  // Там всё наоборот: затемнённый вариант нечитаем, а фирменный даёт 5,6.
  // Токен переопределяется на самих блоках — проверяем, что это правило
  // никуда не делось вместе с его причиной.
  assert.match(CSS, /\.limits,\.specialists[^{]*\{--coral-text:var\(--coral\)\}/,
    "переопределения --coral-text на тёмных блоках нет");
  const value = ratio(token("coral"), token("black"));
  assert.ok(value >= 4.5, `--coral на чёрном: ${value.toFixed(2)}`);
});

test("основной текст читается с большим запасом", () => {
  // Не формальность: если однажды кто-то решит «осветлить» чёрный, порог
  // поймает это до того, как поймает читатель.
  for (const [name, { bg }] of Object.entries(BACKGROUNDS)) {
    const value = ratio(token("black"), bg());
    assert.ok(value >= 7, `--black на «${name}»: ${value.toFixed(2)} при норме 7 (AAA)`);
  }
});

test("в стилях не осталось почти-таких-же серых мимо токена", () => {
  // Раньше рядом с --muted жили #74766e, #777970 и #8a8b84 — те же полтона,
  // вписанные руками. Все трое были под нормой, и чинить их приходилось
  // по отдельности.
  for (const stray of ["#75766f", "#74766e", "#777970", "#8a8b84"]) {
    assert.ok(!CSS.includes(stray), `${stray} снова в globals.css — это должен быть var(--muted)`);
  }
});

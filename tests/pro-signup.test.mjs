import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSignup, NAME_MAX } from "../lib/pro/signup.ts";

/**
 * Самостоятельная регистрация специалиста.
 *
 * До неё имя, которое увидит клиент, читал человек: профиль заводили руками
 * после разговора. Теперь не читает никто, и между «я ввёл имя» и «клиент
 * увидел имя» не осталось ни одной пары глаз. Проверки ниже — про конкретные
 * способы обмануть клиента, а не про «плохие слова».
 */

test("имя обязательно и не бывает односимвольным", () => {
  assert.equal(validateSignup({ displayName: "", consent: true }).ok, false);
  assert.equal(validateSignup({ displayName: "   ", consent: true }).ok, false);
  assert.equal(validateSignup({ displayName: "М", consent: true }).error, "short_name");
  assert.equal(validateSignup({ displayName: "Марина Соколова", consent: true }).ok, true);
});

test("нельзя выдать себя за сервис", () => {
  // Самый дешёвый способ получить чужой дневник — назваться теми, кому и так
  // доверяют. Клиент, увидевший «Живое Тело · поддержка», откроет всё.
  for (const name of [
    "Живое Тело",
    "живоетело поддержка",
    "Служба поддержки Jivoetelo",
    "Модерация сервиса",
    "Официальный нутрициолог",
  ]) {
    const result = validateSignup({ displayName: name, consent: true });
    assert.equal(result.ok, false, `«${name}» прошло`);
    assert.equal(result.error, "reserved_name", `«${name}»`);
  }
});

test("нельзя изобразить отметку проверки", () => {
  // Отметку «проверен сервисом» ставим мы, и рисовать её галочкой в имени —
  // ровно тот обман, ради предотвращения которого отметка и заведена.
  for (const name of ["Марина Соколова ✓", "Анна Петрова ★", "Иван Иванов ®"]) {
    assert.equal(validateSignup({ displayName: name, consent: true }).error, "shouty_name", name);
  }
});

test("имя, а не объявление", () => {
  for (const name of [
    "НУТРИЦИОЛОГ АННА",
    "Анна · t.me/annadiet",
    "Марина https://example.test",
    "Пишите +7 999 123-45-67",
    "@nutri_anna консультации",
  ]) {
    assert.equal(validateSignup({ displayName: name, consent: true }).error, "shouty_name", name);
  }
});

test("законные написания не ломаются", () => {
  // Порог по доле заглавных, а не по факту: инициалы и аббревиатуры внутри
  // имени — обычное дело, и запрет на них выгнал бы половину настоящих имён.
  for (const name of ["М. И. Петрова", "Анна О'Брайен", "Пак Ён Хи", "Мария Ким, PhD"]) {
    assert.equal(validateSignup({ displayName: name, consent: true }).ok, true, name);
  }
});

test("согласие проверяется явно, а не подразумевается", () => {
  assert.equal(validateSignup({ displayName: "Марина Соколова" }).error, "no_consent");
  assert.equal(validateSignup({ displayName: "Марина Соколова", consent: false }).error, "no_consent");
});

test("длина режется, пробелы схлопываются, пустые поля становятся null", () => {
  // Строчными: «Я» в сотне повторов — это ещё и крик, и проверка длины
  // споткнулась бы о запрет заглавных, ничего не сказав про обрезку.
  const long = `Марина ${"я".repeat(NAME_MAX + 40)}`;
  const result = validateSignup({ displayName: long, city: "  ", about: " Веду приём ", consent: true });
  assert.equal(result.ok, true);
  assert.equal(result.value.displayName.length, NAME_MAX);
  assert.equal(result.value.city, null, "пустая строка в базе — это не «не указано»");
  assert.equal(result.value.about, "Веду приём");

  const spaced = validateSignup({ displayName: "Марина    Соколова", consent: true });
  assert.equal(spaced.value.displayName, "Марина Соколова");
});

/**
 * Главный запрет новой модели, и его нельзя проверить поведением.
 *
 * Регистрация открывает кабинет сразу, и это безопасно ровно потому, что
 * кабинет ничего не открывает сам: дверь к данным стоит у клиента и
 * охраняется `canAccess`. Если однажды кто-то заведёт в проходе исключение
 * «для самозарегистрировавшихся» или начнёт спрашивать про `verifiedAt`,
 * отметка из подписи под именем превратится в ворота — и весь смысл
 * самостоятельной регистрации пропадёт молча.
 */
test("проход к данным не спрашивает про отметку проверки", async () => {
  for (const path of ["../lib/pro/guard.ts", "../lib/pro/access.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.ok(!code.includes("verifiedAt"), `${path}: отметка проверки попала в проход к данным`);
    assert.ok(!code.includes("verified_at"), `${path}: отметка проверки попала в проход к данным`);
  }
});

test("самостоятельная регистрация не воскрешает закрытый доступ", async () => {
  // Иначе заблокированный специалист восстанавливал бы себе кабинет, просто
  // открыв форму регистрации, — и блокировка не значила бы ничего.
  const source = await readFile(new URL("../app/pro/registraciya/actions.ts", import.meta.url), "utf8");
  assert.ok(source.includes('existing.status === "rejected"'), "нет проверки отклонённых");
  assert.ok(source.includes('existing.status === "suspended"'), "нет проверки приостановленных");

  const store = await readFile(new URL("../lib/pro/store.ts", import.meta.url), "utf8");
  const update = store.slice(store.indexOf("export async function updateSpecialistProfile"));
  const body = update.slice(0, update.indexOf("\n}\n"));
  assert.ok(!body.includes("status:"), "правка профиля трогает статус — это обход блокировки");
});

test("зарегистрировавшийся сам не получает отметку проверки", async () => {
  // Одна строка `verifiedAt: now` в заведении профиля — и клиенту вместо
  // «имя специалист указал сам» показывается «проверен сервисом». Ничего
  // видимого при этом не ломается: экран выглядит правильно, просто говорит
  // неправду, и заметить это можно только зная, что искать.
  const store = await readFile(new URL("../lib/pro/store.ts", import.meta.url), "utf8");
  const register = store.slice(store.indexOf("export async function registerSpecialist"));
  const body = register.slice(0, register.indexOf("\n}\n"));
  assert.ok(
    !body.includes("verifiedAt"),
    "самостоятельная регистрация ставит отметку проверки — сервис ручается за того, кого не видел",
  );
});

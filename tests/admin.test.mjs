import assert from "node:assert/strict";
import { test } from "node:test";
import { isAdminEmail, parseAdminEmails } from "../lib/admin.ts";

/**
 * Тестируется только чистая часть `lib/admin.ts` — `parseAdminEmails` и
 * `isAdminEmail`. `requireAdmin` сюда не входит: она ходит за сессией и в
 * базу, и правильное место для неё — не этот файл.
 *
 * Главное свойство, которое здесь проверяется от противного: пустая
 * переменная `ADMIN_EMAILS` не значит «пускать всех». Она значит «админов
 * нет вообще». Одна ошибка в эту сторону — и админкой сможет пользоваться
 * кто угодно, потому что переменную забыли задать при деплое.
 */

test("не заданная переменная — админов нет вообще", () => {
  // undefined — обычное состояние ADMIN_EMAILS, если её забыли прописать в
  // .env. В этом случае не должно быть ни одного админа, а не «все».
  assert.deepEqual(parseAdminEmails(undefined), []);
  assert.equal(isAdminEmail("кто-угодно@example.com", undefined), false);
  assert.equal(isAdminEmail("", undefined), false);
});

test("пустая строка в переменной — тоже «админов нет», а не «пускать всех»", () => {
  // Отдельно от undefined: ADMIN_EMAILS="" — валидная, но пустая строка.
  // Обязательный тест по условию задачи: пустое значение не должно
  // трактоваться как «проверка выключена».
  assert.deepEqual(parseAdminEmails(""), []);
  assert.equal(isAdminEmail("admin@example.com", ""), false);
});

test("пробелы вокруг адреса не мешают совпадению", () => {
  // Переменную окружения человек пишет руками, и пробел после запятой —
  // обычное дело. Он не должен превращать корректный адрес в непрошедший.
  assert.deepEqual(parseAdminEmails(" admin@example.com "), ["admin@example.com"]);
  assert.equal(isAdminEmail("admin@example.com", " admin@example.com "), true);
});

test("регистр буквы адреса не влияет на совпадение", () => {
  // Почтовые адреса нечувствительны к регистру на практике, а человек может
  // ввести и то, и другое написание — в переменной и при входе.
  assert.equal(isAdminEmail("Admin@Example.com", "admin@example.com"), true);
  assert.equal(isAdminEmail("admin@example.com", "ADMIN@EXAMPLE.COM"), true);
  assert.deepEqual(parseAdminEmails("Admin@Example.COM"), ["admin@example.com"]);
});

test("несколько адресов через запятую разбираются все", () => {
  const raw = "a@x.com,b@y.com,c@z.com";
  assert.deepEqual(parseAdminEmails(raw), ["a@x.com", "b@y.com", "c@z.com"]);
  assert.equal(isAdminEmail("a@x.com", raw), true);
  assert.equal(isAdminEmail("b@y.com", raw), true);
  assert.equal(isAdminEmail("c@z.com", raw), true);
});

test("адрес не из списка не проходит", () => {
  const raw = "a@x.com,b@y.com";
  assert.equal(isAdminEmail("hacker@evil.com", raw), false);
  // Ни один префикс/суффикс совпадения не считается совпадением.
  assert.equal(isAdminEmail("a@x.com.evil.com", raw), false);
});

test("лишние запятые и пробелы между адресами не создают пустых записей", () => {
  // ",," или " , " по ошибке в .env не должны превращаться в пустую строку
  // в списке адресов.
  assert.deepEqual(parseAdminEmails("a@x.com,, b@y.com ,"), ["a@x.com", "b@y.com"]);
});

test("одни запятые и пробелы в переменной — мусор, а не список", () => {
  // Переменная технически задана и не пуста как строка, но не содержит ни
  // одного настоящего адреса — итог должен быть тем же, что и для пустой
  // переменной: админов нет.
  for (const garbage of [",,,", " , , ", "   ", ","]) {
    assert.deepEqual(parseAdminEmails(garbage), [], `мусор: ${JSON.stringify(garbage)}`);
    assert.equal(isAdminEmail("admin@example.com", garbage), false, `мусор: ${JSON.stringify(garbage)}`);
  }
});

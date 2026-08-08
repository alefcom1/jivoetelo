import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { monogramHue, monogramLetter } from "../lib/monogram.ts";
import { photoBelongsTo } from "../lib/storage.ts";

/**
 * Фото профиля.
 *
 * Проверяется не «картинка показалась», а два свойства, ошибка в которых
 * дорого стоит: чужое фото не должно открываться, а монограмма — прыгать
 * от загрузки к загрузке. Второе кажется мелочью, но цвет и буква тут вся
 * функция: аватар, меняющий вид при каждом заходе, не узнаётся вовсе.
 */

test("монограмма постоянна для одного адреса и различна для разных", () => {
  assert.equal(monogramHue("alefcom1@gmail.com"), monogramHue("alefcom1@gmail.com"));
  assert.equal(monogramLetter("alefcom1@gmail.com"), "A");
  assert.notEqual(monogramHue("a@b.ru"), monogramHue("z@b.ru"));
});

test("без адреса монограмма всё равно есть", () => {
  // Аккаунт из Mini App живёт без почты. Пустой круг читался бы как ошибка
  // загрузки, а не как «фото нет».
  assert.equal(monogramLetter(null), "Ж");
  assert.equal(monogramHue(null), 0);
});

test("оттенок лежит в границах круга", () => {
  for (const source of ["", "a", "очень длинный адрес@example.com", "ЖЖЖ"]) {
    const hue = monogramHue(source);
    assert.ok(hue >= 0 && hue < 360, `${source} → ${hue}`);
  }
});

test("аватар отдаётся только владельцу", () => {
  // Ключ аватара — обычный ключ снимка, и защита у него та же: владелец
  // виден из самого ключа. Заведи мы для фото профиля отдельное хранилище,
  // эту проверку пришлось бы писать заново.
  assert.equal(photoBelongsTo("42/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.jpg", 42), true);
  assert.equal(photoBelongsTo("42/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.jpg", 43), false);
  assert.equal(photoBelongsTo("../etc/passwd", 42), false);
  assert.equal(photoBelongsTo("42/../43/x.jpg", 42), false);
});

test("миграция добавляет колонку идемпотентно и с точкой с запятой", async () => {
  // Раннер оборачивает каждый файл в транзакцию и требует завершающую `;`
  // (deploy/migrate.sh); повторный прогон не должен падать.
  const sql = await readFile("drizzle/0030_avatar.sql", "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS avatar_key text;/);
  assert.ok(sql.trimEnd().endsWith(";"));
});

test("колонка объявлена и в схеме, и в чтении пользователя", async () => {
  // Колонка, о которой знает только база, — это колонка, которой нет:
  // интерфейс её не увидит, и понять почему будет неоткуда.
  const schema = await readFile("db/schema.ts", "utf8");
  assert.match(schema, /avatarKey: text\("avatar_key"\)/);
  for (const file of ["lib/auth.ts", "lib/telegram.ts", "lib/profile.ts"]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /avatarKey/, `${file} не читает avatar_key`);
  }
});

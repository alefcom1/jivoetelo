import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Раздача снимков в Mini App (app/api/tg/photo) держится на двух вещах:
// authorize() из app/api/tg/_auth.ts (кто это) и readOwnedPhoto/photoBelongsTo
// из lib/storage.ts (можно ли ему это фото). authorize() тянет за собой
// Postgres (см. lib/telegram.ts) и здесь не поднимается — как и весь
// остальной app/api/tg/*, он проверяется в tests/e2e/telegram.mjs и
// tests/e2e/inbox.mjs на живом сервере. Здесь — юнит-тесты на ту часть,
// что решает судьбу байтов, когда личность уже установлена: она не зависит
// от БД и должна быть в порядке сама по себе.

const uploadsDir = mkdtempSync(path.join(tmpdir(), "jt-photo-test-"));
process.env.UPLOADS_DIR = uploadsDir;

const { photoBelongsTo, readOwnedPhoto, savePhoto } = await import("../lib/storage.ts");

test.after(() => rmSync(uploadsDir, { recursive: true, force: true }));

test("нормальный запрос проходит: владелец получает свои байты и верный Content-Type", async () => {
  const key = await savePhoto(101, Buffer.from("картинка сырников"), "image/jpeg");
  const photo = await readOwnedPhoto(101, key);
  assert.ok(photo, "фото должно отдаться владельцу");
  assert.equal(photo.data.toString(), "картинка сырников");
  assert.equal(photo.mime, "image/jpeg");
});

test("чужой снимок не отдаётся, даже когда файл реально существует на диске", async () => {
  const key = await savePhoto(101, Buffer.from("завтрак Марины"), "image/png");
  assert.equal(await readOwnedPhoto(202, key), null, "снимок другого пользователя должен получить отказ");
  // И сам файл на месте, и ключ существует — отказ именно по владению, не по ошибке.
  assert.equal(await readOwnedPhoto(101, key).then((p) => p?.data.toString()), "завтрак Марины");
});

test("несуществующий файл — тоже null, а не исключение: ключ мог указывать на уже удалённое фото", async () => {
  const key = "303/00000000-0000-0000-0000-000000000000.jpg";
  assert.equal(photoBelongsTo(key, 303), true, "ключ по формату принадлежит владельцу");
  assert.equal(await readOwnedPhoto(303, key), null, "но файла на диске нет — отдавать нечего");
});

test("подмена userId в начале ключа не проходит: «1/…» не совпадает с «12/…»", () => {
  // Наивная проверка через startsWith без разделителя пропустила бы это:
  // "12/x.jpg".startsWith("1") === true. Разделитель "/" в шаблоне обязателен.
  assert.equal(photoBelongsTo("12/aaaa-bbbb.jpg", 1), false);
  assert.equal(photoBelongsTo("12/aaaa-bbbb.jpg", 12), true);
});

test("попытка выйти за пределы папки пользователя через путь отклоняется", () => {
  assert.equal(photoBelongsTo("101/../202/photo.jpg", 101), false);
  assert.equal(photoBelongsTo("101/sub/photo.jpg", 101), false);
  assert.equal(photoBelongsTo("../101/photo.jpg", 101), false);
});

test("ключ без числового владельца или без допустимого расширения — не свой никому", () => {
  assert.equal(photoBelongsTo("не-число/photo.jpg", 1), false);
  assert.equal(photoBelongsTo("101/photo", 101), false);
  assert.equal(photoBelongsTo("", 101), false);
});

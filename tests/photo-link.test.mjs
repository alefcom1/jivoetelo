import test from "node:test";
import assert from "node:assert/strict";
import { photoLinkFor, signPhotoLink, verifyPhotoLink } from "../lib/ai/photo-link.ts";
import { isPhotoKey } from "../lib/storage.ts";

/**
 * Подписанная ссылка на снимок (lib/ai/photo-link.ts, docs/ai-proxy.md).
 *
 * Это единственный маршрут, отдающий фото без авторизации: за снимком идёт
 * сервер Anthropic, у которого нет ни сессии, ни initData. Вся защита здесь
 * держится на подписи и сроке, поэтому проверяем не «работает ли», а
 * «отказывает ли» — по каждому способу подделки отдельно.
 */

const KEY = "7/2f1a9c4e-0b3d-4e8a-9f21-5c6d7e8f9a0b.jpg";

test("своя ссылка разбирается обратно в ключ файла", () => {
  const token = signPhotoLink(KEY);
  assert.equal(verifyPhotoLink(token), KEY);
});

test("просроченная ссылка не открывается", () => {
  // Выписываем «в прошлом»: шесть минут назад при сроке жизни в пять.
  const token = signPhotoLink(KEY, Date.now() - 6 * 60_000);
  assert.equal(verifyPhotoLink(token), null);
});

test("ссылка живёт ровно отведённое время, а не до перезапуска", () => {
  const issued = Date.now();
  const token = signPhotoLink(KEY, issued);
  assert.equal(verifyPhotoLink(token, issued + 4 * 60_000), KEY, "через четыре минуты ещё жива");
  assert.equal(verifyPhotoLink(token, issued + 6 * 60_000), null, "через шесть — уже нет");
});

test("подменённый ключ файла не проходит: подпись считается вместе со сроком", () => {
  const token = signPhotoLink(KEY);
  const [, mac] = token.split(".");
  // Пробуем выдать чужой снимок под нашей подписью.
  const foreign = Buffer.from(`${Date.now() + 60_000}:1/деньги.jpg`, "utf8").toString("base64url");
  assert.equal(verifyPhotoLink(`${foreign}.${mac}`), null);
});

test("продлить срок, не имея ключа подписи, нельзя", () => {
  const issued = Date.now() - 6 * 60_000;
  const token = signPhotoLink(KEY, issued);
  const [, mac] = token.split(".");
  const stretched = Buffer.from(`${Date.now() + 60_000}:${KEY}`, "utf8").toString("base64url");
  assert.equal(verifyPhotoLink(`${stretched}.${mac}`), null);
});

test("испорченная подпись не проходит", () => {
  const token = signPhotoLink(KEY);
  const [payload, mac] = token.split(".");
  const broken = mac.slice(0, -1) + (mac.endsWith("A") ? "B" : "A");
  assert.equal(verifyPhotoLink(`${payload}.${broken}`), null);
});

test("мусор вместо токена не роняет разбор", () => {
  for (const junk of ["", ".", "нетточки", "a.b", "....", "%%%.%%%"]) {
    assert.equal(verifyPhotoLink(junk), null, `не должно проходить: ${JSON.stringify(junk)}`);
  }
});

test("ключ с выходом из каталога отсекается формой, даже если подпись сошлась", () => {
  // Подпись своя — значит verify его пропустит. Второй рубеж (isPhotoKey
  // в маршруте) существует ровно на случай утечки ключа подписи.
  const escape = "../../etc/passwd";
  assert.equal(verifyPhotoLink(signPhotoLink(escape)), escape, "проверка теста: подпись своя");
  assert.equal(isPhotoKey(escape), false, "но по форме такой ключ маршрут не примет");
  assert.equal(isPhotoKey(KEY), true);
});

test("без HTTPS ссылку не выписываем: чужой сервер по ней не придёт", () => {
  const before = process.env.SITE_URL;
  try {
    // В разработке адрес — localhost по http. Для сервера Anthropic это его
    // собственный localhost, то есть ссылка в никуда: лучше отправка телом.
    process.env.SITE_URL = "http://localhost:3000";
    assert.equal(photoLinkFor(KEY), null);

    process.env.SITE_URL = "https://jivoetelo.ru";
    const link = photoLinkFor(KEY);
    assert.ok(link?.startsWith("https://jivoetelo.ru/api/ai-photo/"), `неожиданный адрес: ${link}`);
    assert.equal(verifyPhotoLink(link.split("/api/ai-photo/")[1]), KEY);
  } finally {
    if (before === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = before;
  }
});

test("ключ файла в адресе не читается открытым текстом", () => {
  // Не секрет сам по себе, но и выставлять идентификатор пользователя в
  // адресе, который уйдёт в чужие логи, незачем.
  const link = signPhotoLink(KEY);
  assert.ok(!link.includes(KEY), "ключ не должен лежать в адресе как есть");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  TelegramApiError,
  createTelegramClient,
  mimeFromPath,
  pickPhotoSize,
  trySend,
} from "../lib/telegram-api.ts";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("из лестницы превью берётся самое крупное, влезающее в лимит", () => {
  const sizes = [
    { file_id: "s", file_unique_id: "s", file_size: 1_000 },
    { file_id: "m", file_unique_id: "m", file_size: 50_000 },
    { file_id: "l", file_unique_id: "l", file_size: 900_000 },
    { file_id: "xl", file_unique_id: "xl", file_size: 9_000_000 },
  ];
  assert.equal(pickPhotoSize(sizes, 1_000_000)?.file_id, "l");
  assert.equal(pickPhotoSize(sizes, 60_000)?.file_id, "m");
});

test("если не влезает ни одно превью, размер не выбирается", () => {
  const sizes = [{ file_id: "xl", file_unique_id: "xl", file_size: 9_000_000 }];
  assert.equal(pickPhotoSize(sizes, 1_000_000), null);
  assert.equal(pickPhotoSize([], 1_000_000), null);
  assert.equal(pickPhotoSize(undefined, 1_000_000), null);
});

test("превью без размера считается допустимым: Telegram не всегда его сообщает", () => {
  const sizes = [{ file_id: "unknown", file_unique_id: "u" }];
  assert.equal(pickPhotoSize(sizes, 100)?.file_id, "unknown");
});

test("MIME определяется по расширению из пути Telegram", () => {
  assert.equal(mimeFromPath("photos/file_1.jpg"), "image/jpeg");
  assert.equal(mimeFromPath("photos/file_1.JPEG"), "image/jpeg");
  assert.equal(mimeFromPath("documents/file.png"), "image/png");
  assert.equal(mimeFromPath("documents/file.heic"), "application/octet-stream");
  assert.equal(mimeFromPath("noextension"), "application/octet-stream");
});

test("ошибка Telegram превращается в TelegramApiError с кодом", async () => {
  const client = createTelegramClient("token", async () =>
    jsonResponse({ ok: false, error_code: 403, description: "bot was blocked by the user" }, 403));

  await assert.rejects(() => client.sendMessage(1, "привет"), (error) => {
    assert.ok(error instanceof TelegramApiError);
    assert.equal(error.errorCode, 403);
    assert.ok(error.isBlockedByUser);
    return true;
  });
});

test("сетевой сбой тоже становится TelegramApiError, а не голым Error", async () => {
  const client = createTelegramClient("token", async () => {
    throw new Error("ECONNRESET");
  });
  await assert.rejects(() => client.sendMessage(1, "привет"), TelegramApiError);
});

test("trySend гасит блокировку бота и возвращает false", async () => {
  const client = createTelegramClient("token", async () =>
    jsonResponse({ ok: false, error_code: 403, description: "blocked" }, 403));
  assert.equal(await trySend(client, 1, "привет"), false);
});

test("trySend возвращает true при успехе", async () => {
  const client = createTelegramClient("token", async () => jsonResponse({ ok: true, result: {} }));
  assert.equal(await trySend(client, 1, "привет"), true);
});

test("отключение предпросмотра ссылок доезжает до запроса", async () => {
  let body = null;
  const client = createTelegramClient("token", async (_url, init) => {
    body = JSON.parse(init.body);
    return jsonResponse({ ok: true, result: {} });
  });
  await client.sendMessage(5, "текст", { disablePreview: true, replyMarkup: { inline_keyboard: [] } });
  assert.equal(body.chat_id, 5);
  assert.equal(body.link_preview_options.is_disabled, true);
  assert.deepEqual(body.reply_markup, { inline_keyboard: [] });
});

test("токен не попадает в тело запроса, только в путь", async () => {
  let seenUrl = null;
  let seenBody = null;
  const client = createTelegramClient("СЕКРЕТ", async (url, init) => {
    seenUrl = url;
    seenBody = init.body;
    return jsonResponse({ ok: true, result: {} });
  });
  await client.sendMessage(1, "текст");
  assert.match(seenUrl, /\/botСЕКРЕТ\/sendMessage$/);
  assert.doesNotMatch(seenBody, /СЕКРЕТ/);
});

test("скачивание файла возвращает данные и MIME по пути", async () => {
  const client = createTelegramClient("token", async (url) => {
    if (url.includes("/getFile")) return jsonResponse({ ok: true, result: { file_path: "photos/x.jpg", file_size: 10 } });
    return new Response(Buffer.from("0123456789"), { status: 200 });
  });
  const file = await client.downloadFile("id", 1_000_000);
  assert.equal(file.mime, "image/jpeg");
  assert.equal(file.data.byteLength, 10);
});

test("слишком большой файл отвергается до скачивания", async () => {
  let downloaded = false;
  const client = createTelegramClient("token", async (url) => {
    if (url.includes("/getFile")) return jsonResponse({ ok: true, result: { file_path: "p.jpg", file_size: 20_000_000 } });
    downloaded = true;
    return new Response(Buffer.alloc(10));
  });
  await assert.rejects(() => client.downloadFile("id", 8_000_000), /too large/);
  assert.equal(downloaded, false);
});

test("файл, оказавшийся больше заявленного, тоже отвергается", async () => {
  // Telegram не обязан сообщать file_size; проверка после скачивания —
  // единственная защита от неожиданно большого файла.
  const client = createTelegramClient("token", async (url) => {
    if (url.includes("/getFile")) return jsonResponse({ ok: true, result: { file_path: "p.jpg" } });
    return new Response(Buffer.alloc(500));
  });
  await assert.rejects(() => client.downloadFile("id", 100), /too large/);
});

test("нечитаемый ответ не выдаётся за успешный", async () => {
  const client = createTelegramClient("token", async () => new Response("<html>502</html>", { status: 502 }));
  await assert.rejects(() => client.sendMessage(1, "текст"), /unparsable/);
});

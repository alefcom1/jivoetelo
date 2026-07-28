import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_INBOX_PHOTOS_PER_DAY,
  TEXTS,
  handleUpdate,
  photoSavedText,
} from "../lib/bot/handle-update.ts";

const NOW = new Date("2026-07-28T15:40:00Z"); // 18:40 в Москве

/**
 * Тестовые зависимости бота: считаем отправленные сообщения и подменяем
 * хранилище. Никакой сети и никакой базы — сценарии проверяются целиком.
 */
function makeDeps(overrides = {}) {
  const sent = [];
  const answered = [];
  const saved = [];
  const inbox = [];
  const prefs = [];

  const store = {
    users: new Map([["100", { id: 7 }]]),
    async findUserByTelegram(tgId) {
      return store.users.get(tgId) ?? null;
    },
    async linkByCode(code, tgId) {
      if (code !== "A1B2C3D4") return null;
      store.users.set(tgId, { id: 42 });
      return { id: 42 };
    },
    async countInboxToday() {
      return overrides.inboxToday ?? 0;
    },
    async savePhoto(userId, data, mime) {
      saved.push({ userId, bytes: data.byteLength, mime });
      return `${userId}/photo.jpg`;
    },
    async addToInbox(input) {
      inbox.push(input);
    },
    async setRemindersEnabled(userId, enabled) {
      prefs.push({ userId, enabled });
    },
    async snoozeReminders(userId, until) {
      prefs.push({ userId, until });
    },
  };

  const client = {
    async call() {
      return {};
    },
    async sendMessage(chatId, text, options) {
      sent.push({ chatId, text, options });
    },
    async answerCallbackQuery(id, text) {
      answered.push({ id, text });
    },
    async downloadFile() {
      if (overrides.downloadFails) throw new Error("network down");
      return { data: Buffer.from("jpegdata"), mime: "image/jpeg" };
    },
  };

  return {
    deps: {
      client,
      store,
      now: NOW,
      timeZone: "Europe/Moscow",
      links: { inboxUrl: "https://jivoetelo.ru/app/inbox", miniAppUrl: overrides.miniAppUrl ?? null },
    },
    sent,
    answered,
    saved,
    inbox,
    prefs,
  };
}

function photoUpdate(extra = {}) {
  return {
    message: {
      from: { id: 100 },
      chat: { id: 100 },
      photo: [
        { file_id: "small", file_unique_id: "s", file_size: 1000 },
        { file_id: "big", file_unique_id: "b", file_size: 200_000 },
      ],
      ...extra,
    },
  };
}

test("фото от привязанного пользователя попадает в инбокс", async () => {
  const { deps, sent, inbox, saved } = makeDeps();
  await handleUpdate(photoUpdate(), deps);

  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].userId, 7);
  assert.equal(saved[0].mime, "image/jpeg");
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /Сохранили/);
});

test("дата и время съёмки берутся из момента получения, по таймзоне продукта", async () => {
  const { deps, inbox } = makeDeps();
  await handleUpdate(photoUpdate(), deps);
  assert.equal(inbox[0].takenOn, "2026-07-28");
  assert.equal(inbox[0].takenTime, "18:40");
});

test("подпись к фото сохраняется как заметка", async () => {
  const { deps, inbox } = makeDeps();
  await handleUpdate(photoUpdate({ caption: "  омлет с сыром  " }), deps);
  assert.equal(inbox[0].note, "омлет с сыром");
});

test("фото без привязки не сохраняется, а объясняет, что делать", async () => {
  const { deps, sent, inbox } = makeDeps();
  await handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, photo: [{ file_id: "x", file_unique_id: "x" }] } }, deps);
  assert.equal(inbox.length, 0);
  assert.equal(sent[0].text, TEXTS.needLinkForPhoto);
});

test("изображение, отправленное файлом, тоже попадает в инбокс", async () => {
  const { deps, inbox } = makeDeps();
  await handleUpdate(
    { message: { from: { id: 100 }, chat: { id: 100 }, document: { file_id: "doc", mime_type: "image/png", file_size: 5000 } } },
    deps,
  );
  assert.equal(inbox.length, 1);
});

test("документ не-изображение игнорируется как еда и получает подсказку", async () => {
  const { deps, sent, inbox } = makeDeps();
  await handleUpdate(
    { message: { from: { id: 100 }, chat: { id: 100 }, document: { file_id: "doc", mime_type: "application/pdf", file_size: 5000 } } },
    deps,
  );
  assert.equal(inbox.length, 0);
  assert.equal(sent[0].text, TEXTS.help);
});

test("слишком большое фото отклоняется без скачивания", async () => {
  const { deps, sent, inbox, saved } = makeDeps();
  await handleUpdate(
    { message: { from: { id: 100 }, chat: { id: 100 }, photo: [{ file_id: "huge", file_unique_id: "h", file_size: 20_000_000 }] } },
    deps,
  );
  assert.equal(saved.length, 0);
  assert.equal(inbox.length, 0);
  assert.equal(sent[0].text, TEXTS.photoTooLarge);
});

test("дневной лимит инбокса останавливает заливку альбома", async () => {
  const { deps, sent, inbox } = makeDeps({ inboxToday: MAX_INBOX_PHOTOS_PER_DAY });
  await handleUpdate(photoUpdate(), deps);
  assert.equal(inbox.length, 0);
  assert.equal(sent[0].text, TEXTS.dailyLimit);
});

test("сбой скачивания не роняет обработку и объясняется человеку", async () => {
  const { deps, sent, inbox } = makeDeps({ downloadFails: true });
  await handleUpdate(photoUpdate(), deps);
  assert.equal(inbox.length, 0);
  assert.equal(sent[0].text, TEXTS.photoFailed);
});

test("/start без привязки объясняет, где взять код", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, text: "/start" } }, deps);
  assert.equal(sent[0].text, TEXTS.greetingUnlinked);
});

test("/start у привязанного здоровается иначе", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate({ message: { from: { id: 100 }, chat: { id: 100 }, text: "/start" } }, deps);
  assert.equal(sent[0].text, TEXTS.greetingLinked);
});

test("код привязки работает и отдельным сообщением, и в диплинке", async () => {
  for (const text of ["A1B2C3D4", "a1b2c3d4", "/start A1B2C3D4"]) {
    const { deps, sent } = makeDeps();
    await handleUpdate({ message: { from: { id: 555 }, chat: { id: 555 }, text } }, deps);
    assert.equal(sent[0].text, TEXTS.greetingLinked, text);
  }
});

test("неверный код не притворяется успехом", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate({ message: { from: { id: 555 }, chat: { id: 555 }, text: "FFFFFFFF" } }, deps);
  assert.equal(sent[0].text, TEXTS.linkFailed);
});

test("/stop выключает напоминания", async () => {
  const { deps, sent, prefs } = makeDeps();
  await handleUpdate({ message: { from: { id: 100 }, chat: { id: 100 }, text: "/stop" } }, deps);
  assert.deepEqual(prefs, [{ userId: 7, enabled: false }]);
  assert.equal(sent[0].text, TEXTS.remindersOff);
});

test("кнопка паузы ставит паузу и подтверждает нажатие", async () => {
  const { deps, sent, answered, prefs } = makeDeps();
  await handleUpdate(
    { callback_query: { id: "cb1", from: { id: 100 }, message: { chat: { id: 100 } }, data: "snooze" } },
    deps,
  );
  assert.equal(answered.length, 1);
  assert.equal(prefs.length, 1);
  assert.ok(prefs[0].until > NOW);
  assert.equal(sent[0].text, TEXTS.snoozed);
});

test("непонятная кнопка просто гасится, без сообщений", async () => {
  const { deps, sent, answered } = makeDeps();
  await handleUpdate(
    { callback_query: { id: "cb2", from: { id: 100 }, message: { chat: { id: 100 } }, data: "неизвестно" } },
    deps,
  );
  assert.equal(answered.length, 1);
  assert.equal(sent.length, 0);
});

test("пустой и битый апдейт не приводят к падению", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate({}, deps);
  await handleUpdate({ message: {} }, deps);
  await handleUpdate({ callback_query: {} }, deps);
  assert.equal(sent.length, 0);
});

test("подтверждение сохранения считает накопленное за день", () => {
  assert.match(photoSavedText(1), /^Сохранили\./);
  assert.match(photoSavedText(3), /в инбоксе 3/);
});

test("кнопка «Разобрать» ведёт в веб-инбокс, когда Mini App не настроено", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate(photoUpdate(), deps);
  const buttons = sent[0].options.replyMarkup.inline_keyboard.flat();
  assert.equal(buttons[0].url, "https://jivoetelo.ru/app/inbox");
});

test("с настроенным Mini App кнопка открывает инбокс внутри Telegram", async () => {
  const { deps, sent } = makeDeps({ miniAppUrl: "https://jivoetelo.ru/tg" });
  await handleUpdate(photoUpdate(), deps);
  const button = sent[0].options.replyMarkup.inline_keyboard.flat()[0];
  assert.deepEqual(button.web_app, { url: "https://jivoetelo.ru/tg" });
  assert.equal(button.url, undefined, "две формы кнопки одновременно Telegram не примет");
});

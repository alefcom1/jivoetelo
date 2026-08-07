import assert from "node:assert/strict";
import { test } from "node:test";
import { resetWelcomeCard, sendWelcome, sendWelcomeCard } from "../lib/bot/media.ts";
import { TelegramApiError } from "../lib/telegram-api.ts";

/**
 * Главное свойство здесь — запасной путь. Пройдёт ли multipart через наш
 * прокси, до боевого запуска неизвестно, и цена ошибки не должна быть выше
 * «как было раньше»: приветствие уходит текстом.
 */

function clientStub({ photo, message } = {}) {
  const calls = { photos: [], messages: [] };
  return {
    calls,
    async sendPhoto(chatId, source, caption, options) {
      calls.photos.push({ chatId, source, caption, options });
      if (photo) return photo(calls.photos.length, source);
      return "file-1";
    },
    async sendMessage(chatId, text, options) {
      calls.messages.push({ chatId, text, options });
      if (message) message();
    },
    async call() {},
    async answerCallbackQuery() {},
    async downloadFile() {
      throw new Error("не нужен");
    },
  };
}

test("первая отправка заливает файл, вторая идёт по file_id", async () => {
  resetWelcomeCard();
  const client = clientStub();

  assert.equal(await sendWelcomeCard(client, 1, "привет"), true);
  assert.equal(await sendWelcomeCard(client, 2, "привет"), true);

  assert.equal(client.calls.photos.length, 2);
  assert.ok("bytes" in client.calls.photos[0].source, "первый раз — байтами");
  assert.deepEqual(client.calls.photos[1].source, { fileId: "file-1" });
});

test("протухший file_id приводит к повторной заливке, а не к отказу", async () => {
  resetWelcomeCard();
  const client = clientStub({
    photo: (n, source) => {
      if ("fileId" in source && n === 2) throw new TelegramApiError("sendPhoto", "wrong file identifier", 400);
      return "file-2";
    },
  });

  await sendWelcomeCard(client, 1, "привет");
  assert.equal(await sendWelcomeCard(client, 2, "привет"), true);
  assert.equal(client.calls.photos.length, 3);
  assert.ok("bytes" in client.calls.photos[2].source);
});

test("если картинка не уходит, приветствие всё равно доставляется текстом", async () => {
  resetWelcomeCard();
  const client = clientStub({
    photo: () => {
      throw new TelegramApiError("sendPhoto", "unsupported content type", 400);
    },
  });

  await sendWelcome(client, 1, "привет", { parseMode: "HTML" });

  assert.equal(client.calls.messages.length, 1);
  assert.equal(client.calls.messages[0].text, "привет");
  assert.equal(client.calls.messages[0].options.parseMode, "HTML");
});

test("после трёх отказов подряд картинку больше не пробуем", async () => {
  resetWelcomeCard();
  const client = clientStub({
    photo: () => {
      throw new TelegramApiError("sendPhoto", "unsupported content type", 400);
    },
  });

  for (let i = 0; i < 5; i += 1) await sendWelcome(client, 1, "привет");

  assert.equal(client.calls.photos.length, 3, "лишние попытки — это лишние секунды на каждый /start");
  assert.equal(client.calls.messages.length, 5, "а текст уходит всегда");
});

test("заблокировавший бота не считается отказом картинки", async () => {
  // Иначе трое заблокировавших подряд выключили бы картинки для всех
  // остальных — отказ здесь не про картинку вовсе.
  resetWelcomeCard();
  const client = clientStub({
    photo: () => {
      throw new TelegramApiError("sendPhoto", "bot was blocked by the user", 403);
    },
  });

  for (let i = 0; i < 5; i += 1) await sendWelcomeCard(client, 1, "привет");
  assert.equal(client.calls.photos.length, 5);
});

test("403 не от Telegram не выдаётся за успех: приветствие уходит текстом", async () => {
  // Наш прокси отвечает 403 при несовпадении секрета. Пока это считалось
  // блокировкой, функция возвращала «отправлено», запасной путь не запускался
  // и человек на /start не получал ничего вовсе — без единой строки в логе.
  resetWelcomeCard();
  const client = clientStub({
    photo: () => {
      throw new TelegramApiError("sendPhoto", "unparsable response (HTTP 403): forbidden", 403);
    },
  });

  await sendWelcome(client, 1, "привет");

  assert.equal(client.calls.messages.length, 1, "иначе на /start не приходит ничего");
});

test("подпись и клавиатура доходят до Telegram", async () => {
  resetWelcomeCard();
  const client = clientStub();
  const markup = { inline_keyboard: [[{ text: "Открыть дневник", url: "https://jivoetelo.ru/app/inbox" }]] };

  await sendWelcomeCard(client, 42, "<b>Готово</b>", { parseMode: "HTML", replyMarkup: markup });

  const call = client.calls.photos[0];
  assert.equal(call.chatId, 42);
  assert.equal(call.caption, "<b>Готово</b>");
  assert.equal(call.options.parseMode, "HTML");
  assert.deepEqual(call.options.replyMarkup, markup);
});

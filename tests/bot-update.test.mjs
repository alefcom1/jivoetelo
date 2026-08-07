import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_INBOX_PHOTOS_PER_DAY,
  TEXTS,
  handleUpdate,
  photoSavedText,
} from "../lib/bot/handle-update.ts";
import { resetWelcomeCard } from "../lib/bot/media.ts";
import { SpeechError } from "../lib/speech/types.ts";

const NOW = new Date("2026-07-28T15:40:00Z"); // 18:40 в Москве

/**
 * Тестовые зависимости бота: считаем отправленные сообщения и подменяем
 * хранилище. Никакой сети и никакой базы — сценарии проверяются целиком.
 */
function makeDeps(overrides = {}) {
  const sent = [];
  const photos = [];
  const answered = [];
  const saved = [];
  const inbox = [];
  const prefs = [];
  const downloads = [];
  const transcribed = [];
  const weights = [];
  const daySummaries = [];
  const referrals = [];
  const referralVisits = [];
  const inlineAnswers = [];

  // Кэш file_id и счётчик отказов в lib/bot/media.ts живут в модуле, а не в
  // клиенте: без сброса тесты начинали бы зависеть от порядка запуска.
  resetWelcomeCard();

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
    async setWeighRemindersEnabled(userId, enabled) {
      prefs.push({ userId, weighEnabled: enabled });
    },
    async saveWeight(userId, day, weightKg) {
      if (overrides.weightFails) throw new Error("база лежит");
      weights.push({ userId, day, weightKg });
      return overrides.trendLine ?? null;
    },
    async daySummary(userId, day) {
      daySummaries.push({ userId, day });
      return overrides.daySummary ?? {
        totals: { kcal: 1420, protein: 78, fat: 55, carbs: 140, fiber: 18 },
        targets: null,
        mealsCount: 3,
        pendingPhotos: 0,
        showCalories: true,
      };
    },
    async referral(userId) {
      referrals.push({ userId });
      return {
        link: "https://t.me/jivelo_bot?start=ref_k7m2qx7z",
        joined: overrides.joined ?? 0,
        reward: { afterDays: 7, days: 30 },
      };
    },
    async rememberInvite(telegramUserId, code) {
      referralVisits.push({ telegramUserId, code });
    },
    async plan() {
      return overrides.plan ?? "free";
    },
  };

  const client = {
    async call() {
      return {};
    },
    async sendMessage(chatId, text, options) {
      sent.push({ chatId, text, options });
    },
    async sendPhoto(chatId, source, caption, options) {
      if (overrides.photoFails) throw new Error("multipart не прошёл");
      photos.push({ chatId, source, caption, options });
      // Приветствие с картинкой — то же сообщение, просто с подписью.
      // Складываем в общий список, чтобы проверки текста не зависели от
      // того, каким методом оно ушло.
      sent.push({ chatId, text: caption, options, asPhoto: true });
      return "file-1";
    },
    async answerCallbackQuery(id, text) {
      answered.push({ id, text });
    },
    async answerInlineQuery(id, results, options) {
      inlineAnswers.push({ id, results, options });
    },
    async downloadFile(fileId, maxBytes) {
      downloads.push({ fileId, maxBytes });
      if (overrides.downloadFails) throw new Error("network down");
      return overrides.file ?? { data: Buffer.from("jpegdata"), mime: "image/jpeg" };
    },
  };

  return {
    deps: {
      client,
      store,
      now: NOW,
      timeZone: "Europe/Moscow",
      links: {
        inboxUrl: "https://jivoetelo.ru/app/inbox",
        miniAppUrl: overrides.miniAppUrl ?? null,
        planUrl: "https://jivoetelo.ru/raschet/plan",
        premiumUrl: "https://jivoetelo.ru/app/settings",
        dishUrl: (slug) => `https://jivoetelo.ru/skolko-kalorij/${slug}`,
      },
      paymentsEnabled: overrides.paymentsEnabled ?? false,
      // undefined — расшифровка выключена: ровно то состояние, в котором бот
      // работает до появления SPEECH_URL, и остальные проверки исходят из него.
      transcribe: overrides.transcribe
        ? async (input) => { transcribed.push(input); return await overrides.transcribe(input); }
        : undefined,
    },
    sent,
    photos,
    answered,
    saved,
    inbox,
    prefs,
    downloads,
    transcribed,
    weights,
    daySummaries,
    referrals,
    referralVisits,
    inlineAnswers,
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
  assert.match(sent[0].text, /Сохранил/);
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

test("документ не-изображение получает свой ответ, а не общую справку", async () => {
  const { deps, sent, inbox } = makeDeps();
  await handleUpdate(
    { message: { from: { id: 100 }, chat: { id: 100 }, document: { file_id: "doc", mime_type: "application/pdf", file_size: 5000 } } },
    deps,
  );
  assert.equal(inbox.length, 0);
  assert.equal(sent[0].text, TEXTS.fileNotImage);
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
  assert.match(photoSavedText(1), /Сохранил\.<\/b>/);
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

// --- Сценарии беседы, которых раньше не было: всё, кроме фото и кода,
// падало в одну общую справку. Ниже — по тесту на каждый разобранный случай.

function textUpdate(text, tgId = 100) {
  return { message: { from: { id: tgId }, chat: { id: tgId }, text } };
}

function voiceUpdate(extra = {}, tgId = 100) {
  return {
    message: {
      from: { id: tgId },
      chat: { id: tgId },
      voice: { file_id: "voice-1", mime_type: "audio/ogg", duration: 6, ...extra },
    },
  };
}

/** Расшифровка, которая всегда слышит одно и то же. */
const hears = (text) => async () => ({ text });

test("голосовое без расшифровки: честный отказ и рабочий путь", async () => {
  const { deps, sent, downloads } = makeDeps();
  await handleUpdate(voiceUpdate(), deps);
  assert.equal(sent[0].text, TEXTS.voice);
  assert.match(sent[0].text, /фотограф/i, "должен предложить фото как замену");
  assert.equal(downloads.length, 0, "качать файл, который некому разобрать, незачем");
});

test("голосовое: расшифровка попадает в инбокс текстом", async () => {
  const { deps, inbox, transcribed } = makeDeps({ transcribe: hears("овсянка на воде двести грамм") });
  await handleUpdate(voiceUpdate(), deps);

  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].userId, 7);
  assert.equal(inbox[0].photoKey, null, "у записи голосом файла нет");
  assert.equal(inbox[0].note, "овсянка на воде двести грамм");
  // Момент фиксируется при получении, как и у фото: сказанное в 23:50 должно
  // остаться во вчерашнем дне.
  assert.equal(inbox[0].takenOn, "2026-07-28");
  assert.equal(inbox[0].takenTime, "18:40");
  assert.equal(transcribed[0].mime, "audio/ogg");
  assert.equal(transcribed[0].durationSec, 6);
});

test("голосовое: расшифровку показываем человеку целиком", async () => {
  // Распознавание ошибается, и «сто» вместо «сто пятьдесят» человек заметит
  // глазами мгновенно — а в посчитанных калориях уже нет.
  const { deps, sent } = makeDeps({ transcribe: hears("куриная грудка сто пятьдесят грамм") });
  await handleUpdate(voiceUpdate(), deps);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /куриная грудка сто пятьдесят грамм/);
});

test("голосовое: разметка в расшифровке не ломает сообщение", async () => {
  // Расшифровка уходит внутрь HTML, а её текст мы не контролируем.
  const { deps, sent } = makeDeps({ transcribe: hears("салат <b>с сыром</b> & хлеб") });
  await handleUpdate(voiceUpdate(), deps);
  assert.match(sent[0].text, /&lt;b&gt;/, "угловые скобки должны быть экранированы");
  assert.match(sent[0].text, /&amp; хлеб/);
});

test("голосовое: аудиофайл разбирается так же", async () => {
  const { deps, inbox } = makeDeps({ transcribe: hears("два яйца") });
  await handleUpdate(
    { message: { from: { id: 100 }, chat: { id: 100 }, audio: { file_id: "a", mime_type: "audio/mpeg", duration: 4 } } },
    deps,
  );
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].note, "два яйца");
});

test("голосовое: длинная запись отсекается до загрузки файла", async () => {
  const { deps, sent, downloads, inbox } = makeDeps({ transcribe: hears("что-то") });
  await handleUpdate(voiceUpdate({ duration: 400 }), deps);
  assert.equal(downloads.length, 0, "длительность известна из апдейта — платить за неё трафиком незачем");
  assert.equal(inbox.length, 0);
  assert.match(sent[0].text, /короче/i);
});

test("голосовое без привязки: объясняем, чего не хватает", async () => {
  const { deps, sent, inbox, downloads } = makeDeps({ transcribe: hears("творог") });
  await handleUpdate(voiceUpdate({}, 999), deps);
  assert.equal(inbox.length, 0);
  assert.equal(downloads.length, 0, "качать запись, которую некуда сохранить, незачем");
  assert.match(sent[0].text, /аккаунт не привязан/i);
});

test("голосовое: дневной потолок инбокса общий с фото", async () => {
  const { deps, sent, inbox } = makeDeps({
    transcribe: hears("творог"),
    inboxToday: MAX_INBOX_PHOTOS_PER_DAY,
  });
  await handleUpdate(voiceUpdate(), deps);
  assert.equal(inbox.length, 0);
  assert.equal(sent[0].text, TEXTS.dailyLimit);
});

test("голосовое: отказ расшифровки объясняется своей причиной", async () => {
  const cases = [
    ["empty", /не слышно/i],
    ["provider_error", /недоступна/i],
    ["unsupported_format", /формат/i],
    ["too_large", /больш/i],
  ];
  for (const [reason, expected] of cases) {
    const { deps, sent, inbox } = makeDeps({
      transcribe: async () => { throw new SpeechError("нет", reason); },
    });
    await handleUpdate(voiceUpdate(), deps);
    assert.equal(inbox.length, 0, reason);
    assert.match(sent[0].text, expected, `не тот текст для ${reason}`);
  }
});

test("голосовое: сбой сети не роняет апдейт и не молчит", async () => {
  const { deps, sent, inbox } = makeDeps({ transcribe: hears("творог"), downloadFails: true });
  await handleUpdate(voiceUpdate(), deps);
  assert.equal(inbox.length, 0);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /не получилось/i);
});

test("голосовое: пустая расшифровка без ошибки в инбокс не идёт", async () => {
  // Разбирать пустую строку нечем, а строка навсегда осталась бы в инбоксе.
  const { deps, sent, inbox } = makeDeps({ transcribe: hears("   ") });
  await handleUpdate(voiceUpdate(), deps);
  assert.equal(inbox.length, 0);
  assert.match(sent[0].text, /не слышно/i);
});

test("голосовое: расшифровка обрезается до предела заметки", async () => {
  const { deps, inbox } = makeDeps({ transcribe: hears("а".repeat(500)) });
  await handleUpdate(voiceUpdate(), deps);
  assert.equal(inbox[0].note.length, 300);
});

test("видео и кружок получают ответ про фотографии", async () => {
  for (const field of ["video", "video_note"]) {
    const { deps, sent } = makeDeps();
    await handleUpdate({ message: { from: { id: 100 }, chat: { id: 100 }, [field]: { file_id: "x" } } }, deps);
    assert.equal(sent[0].text, TEXTS.video, `не разобран ${field}`);
  }
});

test("стикер не остаётся без ответа", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate({ message: { from: { id: 100 }, chat: { id: 100 }, sticker: { file_id: "s" } } }, deps);
  assert.equal(sent[0].text, TEXTS.sticker);
});

test("геопозиция и контакт получают общий отказ, а не молчание", async () => {
  for (const field of ["location", "contact", "poll"]) {
    const { deps, sent } = makeDeps();
    await handleUpdate({ message: { from: { id: 100 }, chat: { id: 100 }, [field]: {} } }, deps);
    assert.equal(sent[0].text, TEXTS.otherAttachment, `не разобран ${field}`);
  }
});

test("описание еды текстом ведёт в приложение, а не в общую справку", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate(textUpdate("два сырника и кофе"), deps);
  assert.equal(sent[0].text, TEXTS.textLooksLikeFood);
  assert.ok(sent[0].options?.replyMarkup, "нужна кнопка перехода в приложение");
});

test("еда с граммовкой опознаётся даже без знакомого продукта", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate(textUpdate("200 г творожной запеканки"), deps);
  assert.equal(sent[0].text, TEXTS.textLooksLikeFood);
});

test("вопрос про здоровье получает дисклеймер, а не совет", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate(textUpdate("а мне при диабете это можно?"), deps);
  assert.match(sent[0].text, /не врач/i);
  assert.doesNotMatch(sent[0].text, /рекоменду|советую/i, "бот не должен советовать по здоровью");
});

test("вопросы про деньги, данные, отвязку и напоминания разведены по темам", async () => {
  const cases = [
    ["сколько стоит подписка?", /бесплатн/i],
    ["как удалить мои данные", /удал/i],
    ["хочу отвязать телеграм", /отвязать/i],
    ["почему приходят напоминания", /напоминани/i],
  ];
  for (const [question, expected] of cases) {
    const { deps, sent } = makeDeps();
    await handleUpdate(textUpdate(question), deps);
    assert.match(sent[0].text, expected, `не тот ответ на «${question}»`);
  }
});

test("/help и /app отвечают по делу", async () => {
  const { deps: d1, sent: s1 } = makeDeps();
  await handleUpdate(textUpdate("/help"), d1);
  assert.equal(s1[0].text, TEXTS.help);

  const { deps: d2, sent: s2 } = makeDeps();
  await handleUpdate(textUpdate("/app"), d2);
  assert.equal(s2[0].text, TEXTS.openApp);
  assert.ok(s2[0].options?.replyMarkup, "у /app должна быть кнопка");
});

test("/stop без привязки не врёт, что что-то выключил", async () => {
  const { deps, sent, prefs } = makeDeps();
  await handleUpdate(textUpdate("/stop", 999), deps);
  assert.deepEqual(prefs, [], "нечего выключать — в базу лезть незачем");
  assert.equal(sent[0].text, TEXTS.remindersOffNoAccount);
});

test("совсем непонятное всё равно получает справку, а не молчание", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate(textUpdate("ъъъ"), deps);
  assert.equal(sent[0].text, TEXTS.help);
});

test("альбом сохраняется целиком, но подтверждение приходит одно", async () => {
  const { deps, sent, inbox } = makeDeps();
  const album = "album-1";
  for (let i = 0; i < 4; i++) {
    await handleUpdate(
      {
        message: {
          from: { id: 100 },
          chat: { id: 100 },
          media_group_id: album,
          photo: [{ file_id: `p${i}`, file_unique_id: `u${i}`, file_size: 1000 }],
        },
      },
      deps,
    );
  }
  assert.equal(inbox.length, 4, "сохраниться должны все снимки");
  assert.equal(sent.length, 1, "а подтверждение — одно на альбом");
});

test("одиночные снимки подтверждаются каждый", async () => {
  const { deps, sent, inbox } = makeDeps();
  for (let i = 0; i < 3; i++) {
    await handleUpdate(
      { message: { from: { id: 100 }, chat: { id: 100 }, photo: [{ file_id: `p${i}`, file_unique_id: `u${i}`, file_size: 1000 }] } },
      deps,
    );
  }
  assert.equal(inbox.length, 3);
  assert.equal(sent.length, 3);
});

test("ни один ответ бота не оценивает еду", () => {
  // Продуктовое правило всего сервиса, в переписке особенно важное:
  // сообщение в мессенджере читается лично.
  const forbidden = /вредн|полезн|слишком много|переел|нельзя есть|плохая еда|отработ|компенсир/i;
  for (const [key, text] of Object.entries(TEXTS)) {
    if (typeof text !== "string") continue;
    assert.doesNotMatch(text, forbidden, `оценочная формулировка в TEXTS.${key}`);
  }
});

test("каждый ответ уходит с разметкой", () => {
  // Забытый parse_mode виден только глазами в переписке: человек читает
  // «<b>Сохранил.</b>» вместо жирной строки, а в логах при этом чисто.
  const cases = [
    { message: { from: { id: 100 }, chat: { id: 100 }, text: "/start" } },
    { message: { from: { id: 100 }, chat: { id: 100 }, text: "/help" } },
    { message: { from: { id: 100 }, chat: { id: 100 }, text: "/app" } },
    { message: { from: { id: 100 }, chat: { id: 100 }, text: "/stop" } },
    { message: { from: { id: 100 }, chat: { id: 100 }, text: "сколько стоит подписка" } },
    { message: { from: { id: 100 }, chat: { id: 100 }, text: "два сырника и кофе" } },
    { message: { from: { id: 100 }, chat: { id: 100 }, voice: {} } },
    { message: { from: { id: 100 }, chat: { id: 100 }, sticker: {} } },
    { message: { from: { id: 555 }, chat: { id: 555 }, text: "FFFFFFFF" } },
    photoUpdate(),
  ];

  return Promise.all(
    cases.map(async (update) => {
      const { deps, sent } = makeDeps();
      await handleUpdate(update, deps);
      assert.equal(sent.length, 1, JSON.stringify(update));
      assert.equal(sent[0].options?.parseMode, "HTML", JSON.stringify(update));
    }),
  );
});

test("незнакомому человеку предлагают расчёт, а не вход в дневник", async () => {
  // «Открыть дневник» ведёт туда, где потребуют войти, — для того, кто
  // только что написал боту впервые, это тупик. Расчёт работает без
  // аккаунта вовсе.
  const { deps, photos } = makeDeps();
  await handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, text: "/start" } }, deps);

  assert.equal(photos.length, 1);
  assert.equal(photos[0].caption, TEXTS.greetingUnlinked);
  const button = photos[0].options.replyMarkup.inline_keyboard.flat()[0];
  assert.equal(button.text, "Посчитать норму");
  assert.equal(button.url, "https://jivoetelo.ru/raschet/plan");
});

test("привязанному человеку предлагают дневник, а не расчёт заново", async () => {
  const { deps, photos } = makeDeps();
  await handleUpdate({ message: { from: { id: 100 }, chat: { id: 100 }, text: "/start" } }, deps);
  assert.equal(photos[0].options.replyMarkup.inline_keyboard.flat()[0].text, "Открыть дневник");
});

test("успешная привязка тоже показывает картинку, неудачная — нет", async () => {
  const ok = makeDeps();
  await handleUpdate({ message: { from: { id: 555 }, chat: { id: 555 }, text: "A1B2C3D4" } }, ok.deps);
  assert.equal(ok.photos.length, 1);

  const bad = makeDeps();
  await handleUpdate({ message: { from: { id: 555 }, chat: { id: 555 }, text: "FFFFFFFF" } }, bad.deps);
  assert.equal(bad.photos.length, 0, "на «код не подошёл» картинка не нужна");
  assert.equal(bad.sent[0].text, TEXTS.linkFailed);
});

test("отказ картинки не оставляет человека без приветствия", async () => {
  // Ровно тот случай, ради которого написан запасной путь: если прокси не
  // пропустит multipart, бот должен вести себя как до этой правки.
  const { deps, sent, photos } = makeDeps({ photoFails: true });
  await handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, text: "/start" } }, deps);

  assert.equal(photos.length, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, TEXTS.greetingUnlinked);
  assert.equal(sent[0].options.parseMode, "HTML");
});

test("пришедшему с сайта по метке не предлагают считать норму заново", async () => {
  // Метка ставится в ссылке на экране результата расчёта и в пустом дневнике.
  // Человек только что посчитал норму и нажал кнопку не за тем, чтобы ему
  // предложили посчитать её ещё раз.
  const { deps, sent } = makeDeps();
  await handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, text: "/start plan" } }, deps);
  assert.equal(sent[0].text, TEXTS.greetingFromSite);
  assert.notEqual(sent[0].text, TEXTS.greetingUnlinked);
});

test("посторонняя метка не считается своей", () => {
  // Метка приходит из адреса, то есть от пользователя. Незнакомую нельзя
  // молча принять за свою — иначе приветствие меняется по чужой команде.
  return Promise.all(["/start чужое", "/start plan_", "/start ../plan"].map(async (text) => {
    const { deps, sent } = makeDeps();
    await handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, text } }, deps);
    assert.equal(sent[0].text, TEXTS.greetingUnlinked, text);
  }));
});

// ===== Сценарии новых команд =====

/** Сообщение от привязанного пользователя (id 100 заведён в makeDeps). */
function linkedText(text) {
  return { message: { from: { id: 100 }, chat: { id: 100 }, text } };
}

test("вес одним сообщением записывается и подтверждается числом", async () => {
  const { deps, sent, weights } = makeDeps({ trendLine: "Тренд за неделю: −0,3 кг." });
  await handleUpdate(linkedText("72,4"), deps);

  assert.deepEqual(weights, [{ userId: 7, day: "2026-07-28", weightKg: 72.4 }]);
  // Подтверждение обязано называть записанное число: «72,4» без ответа — это
  // запись вслепую, а увидев его, человек поправит промах клавиатурой сразу.
  assert.match(sent[0].text, /72,4 кг/);
  assert.match(sent[0].text, /Тренд за неделю/);
});

test("код привязки не путается с весом", async () => {
  // Коды у нас восьмизначные шестнадцатеричные, то есть «12345678» — законный
  // код. Приняв его за вес, бот потерял бы привязку аккаунта.
  const { deps, weights } = makeDeps();
  await handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, text: "A1B2C3D4" } }, deps);
  assert.equal(weights.length, 0);
});

test("вес без аккаунта не теряется молча", async () => {
  const { deps, sent, weights } = makeDeps();
  await handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, text: "72,4" } }, deps);
  assert.equal(weights.length, 0);
  assert.match(sent[0].text, /аккаунт не привязан/i);
});

test("сбой записи веса виден человеку, а не только в логе", async () => {
  const { deps, sent } = makeDeps({ weightFails: true });
  await handleUpdate(linkedText("72,4"), deps);
  assert.match(sent[0].text, /Не получилось записать вес/);
});

test("/day отвечает числами за сегодняшний день", async () => {
  const { deps, sent, daySummaries } = makeDeps();
  await handleUpdate(linkedText("/day"), deps);

  assert.deepEqual(daySummaries, [{ userId: 7, day: "2026-07-28" }]);
  assert.match(sent[0].text, /1420/);
});

test("/day без аккаунта ведёт в расчёт, а не в отказ", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, text: "/day" } }, deps);
  assert.match(sent[0].text, /аккаунт к боту не привязан/);
  assert.equal(sent[0].options.replyMarkup.inline_keyboard[0][0].url, "https://jivoetelo.ru/raschet/plan");
});

test("/invite отдаёт личную ссылку и счётчик", async () => {
  const { deps, sent, referrals } = makeDeps({ joined: 3 });
  await handleUpdate(linkedText("/invite"), deps);
  assert.deepEqual(referrals, [{ userId: 7 }]);
  assert.match(sent[0].text, /ref_k7m2qx7z/);
  assert.match(sent[0].text, /<b>3<\/b>/);
});

test("переход по чужой ссылке запоминается, но приветствие не меняется", async () => {
  // «Вас пригласил такой-то» в первом же сообщении звучит как слежка: человек
  // пришёл смотреть сервис, а не читать про себя.
  const { deps, sent, referralVisits } = makeDeps();
  // Код приглашения строчный: разбирается из исходной строки, а не из
  // приведённой к верхнему регистру — верхний регистр нужен кодам привязки.
  await handleUpdate({ message: { from: { id: 999 }, chat: { id: 999 }, text: "/start ref_k7m2qx7z" } }, deps);

  assert.deepEqual(referralVisits, [{ telegramUserId: "999", code: "k7m2qx7z" }]);
  assert.equal(sent[0].text, TEXTS.greetingUnlinked);
});

test("/premium при выключенном приёме оплаты не показывает кнопку", async () => {
  const { deps, sent } = makeDeps();
  await handleUpdate(linkedText("/premium"), deps);
  assert.match(sent[0].text, /Приём оплаты сейчас выключен/);
  assert.equal(sent[0].options?.replyMarkup, undefined);
});

test("/premium при включённом приёме оплаты ведёт на оплату", async () => {
  const { deps, sent } = makeDeps({ paymentsEnabled: true });
  await handleUpdate(linkedText("/premium"), deps);
  assert.equal(sent[0].options.replyMarkup.inline_keyboard[0][0].url, "https://jivoetelo.ru/app/settings");
});

test("/premium уже подключившему не предлагает купить снова", async () => {
  const { deps, sent } = makeDeps({ paymentsEnabled: true, plan: "premium" });
  await handleUpdate(linkedText("/premium"), deps);
  // Регистр не фиксируем: слово «доступ» переехало в начало предложения,
  // когда из текста ушло «платный» — платным доступ теперь бывает не всегда,
  // его открывает и пробный месяц. Смысл проверки от этого не изменился.
  assert.match(sent[0].text, /доступ у вас уже открыт/i);
  assert.equal(sent[0].options?.replyMarkup, undefined, "кнопка оплаты тому, у кого доступ есть");
});

test("инлайн-запрос отвечает без аккаунта и без обращения в базу", async () => {
  // Аккаунт здесь не спрашивается намеренно: запрос приходит от кого угодно,
  // включая людей, которые бота не открывали, и это единственный канал,
  // который приводит новых людей сам.
  const { deps, inlineAnswers, sent } = makeDeps();
  await handleUpdate({ inline_query: { id: "q1", from: { id: 555 }, query: "борщ" } }, deps);

  assert.equal(inlineAnswers.length, 1);
  assert.ok(inlineAnswers[0].results.length > 0);
  assert.equal(sent.length, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { checkAudio, isAllowedAudioMime, MAX_AUDIO_BYTES, MAX_DURATION_SEC, normalizeAudioMime } from "../lib/speech/limits.ts";
import { resolveSpeechMode } from "../lib/speech/mode.ts";
import { DisabledSpeechProvider } from "../lib/speech/disabled.ts";
import { MockSpeechProvider, SilentSpeechProvider } from "../lib/speech/mock.ts";
import { GigaamSpeechProvider } from "../lib/speech/gigaam.ts";
import { SPEECH_ERRORS, SpeechError } from "../lib/speech/types.ts";

const ogg = (bytes) => ({ data: Buffer.alloc(bytes, 7), mime: "audio/ogg" });

/** Ловит SpeechError и возвращает причину — иначе каждая проверка на три строки длиннее. */
async function reasonOf(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    assert.ok(error instanceof SpeechError, `ожидали SpeechError, получили ${error}`);
    return error.reason;
  }
}

// --- пределы -----------------------------------------------------------

test("тип записи — без параметров и регистра", () => {
  assert.equal(normalizeAudioMime("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(normalizeAudioMime("AUDIO/OGG"), "audio/ogg");
  assert.ok(isAllowedAudioMime("audio/webm;codecs=opus"), "MediaRecorder в браузере шлёт именно так");
  assert.ok(isAllowedAudioMime("audio/ogg"), "Telegram шлёт голосовые как ogg");
  assert.ok(!isAllowedAudioMime("video/mp4"));
  assert.ok(!isAllowedAudioMime("application/octet-stream"));
});

test("слишком длинная запись отсекается до расшифровки", () => {
  const reason = (() => {
    try {
      checkAudio({ ...ogg(1000), durationSec: MAX_DURATION_SEC + 1 });
      return null;
    } catch (error) { return error.reason; }
  })();
  assert.equal(reason, "too_long");
});

test("ровно предел длительности проходит", () => {
  assert.doesNotThrow(() => checkAudio({ ...ogg(1000), durationSec: MAX_DURATION_SEC }));
});

test("слишком большой файл отсекается", async () => {
  assert.equal(await reasonOf(new MockSpeechProvider().transcribe(ogg(MAX_AUDIO_BYTES + 1))), "too_large");
});

test("пустой файл — это обрыв, а не «речи не слышно»", async () => {
  // Разница не косметическая: на «не слышно» человек перезаписывает
  // голосовое, а тут перезаписывать нечего — не доехали байты.
  assert.equal(await reasonOf(new MockSpeechProvider().transcribe(ogg(0))), "provider_error");
});

test("неизвестный формат отсекается", async () => {
  assert.equal(
    await reasonOf(new MockSpeechProvider().transcribe({ data: Buffer.alloc(100), mime: "application/pdf" })),
    "unsupported_format",
  );
});

// --- провайдеры --------------------------------------------------------

test("заглушка возвращает описание еды — дальше его разбирает разбор еды", async () => {
  const result = await new MockSpeechProvider().transcribe(ogg(1000));
  assert.ok(result.text.length > 5);
  // Иначе поток «голосовое → расшифровка → разбор» проверить нечем: разбор
  // еды на пустой строке просто откажется работать.
  assert.match(result.text, /[а-яё]/i);
});

test("разные записи дают разный текст", async () => {
  const provider = new MockSpeechProvider();
  const a = await provider.transcribe(ogg(1000));
  const b = await provider.transcribe(ogg(1001));
  assert.notEqual(a.text, b.text, "иначе не видно, дошла ли расшифровка до разбора");
});

test("выключенная расшифровка — отказ, а не пустой текст", async () => {
  assert.equal(await reasonOf(new DisabledSpeechProvider().transcribe(ogg(1000))), "disabled");
});

test("тишина — отдельная причина", async () => {
  assert.equal(await reasonOf(new SilentSpeechProvider().transcribe(ogg(1000))), "empty");
});

test("у каждой причины есть текст для человека", () => {
  for (const reason of ["disabled", "too_long", "too_large", "unsupported_format", "empty", "provider_error"]) {
    assert.equal(typeof SPEECH_ERRORS[reason], "string", `нет текста для ${reason}`);
    assert.ok(SPEECH_ERRORS[reason].length > 20, `текст для ${reason} слишком короткий`);
  }
});

test("тексты ошибок не обвиняют человека", () => {
  for (const text of Object.values(SPEECH_ERRORS)) {
    assert.ok(!/вы не|вы забыли|неправильно|ошибка пользователя/i.test(text), `обвиняющий текст: ${text}`);
  }
});

// --- выбор режима ------------------------------------------------------

function withEnv(env, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return fn(); } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("без SPEECH_URL: в разработке mock, в продакшене off", () => {
  withEnv({ SPEECH_PROVIDER: undefined, SPEECH_URL: undefined, NODE_ENV: "development" }, () => {
    assert.equal(resolveSpeechMode(), "mock");
  });
  withEnv({ SPEECH_PROVIDER: undefined, SPEECH_URL: undefined, NODE_ENV: "production" }, () => {
    assert.equal(resolveSpeechMode(), "off");
  });
});

test("SPEECH_URL задан — настоящая расшифровка", () => {
  withEnv({ SPEECH_PROVIDER: undefined, SPEECH_URL: "http://127.0.0.1:9000/asr", NODE_ENV: "production" }, () => {
    assert.equal(resolveSpeechMode(), "gigaam");
  });
});

test("mock в продакшене выключается, а не подделывает речь", () => {
  // Здесь строже, чем у разбора еды: mock вернул бы текст, которого человек
  // не говорил, и записал бы его в дневник как сказанное вслух.
  withEnv({ SPEECH_PROVIDER: "mock", SPEECH_URL: "http://127.0.0.1:9000/asr", NODE_ENV: "production" }, () => {
    assert.equal(resolveSpeechMode(), "off");
  });
  withEnv({ SPEECH_PROVIDER: "demo", SPEECH_URL: undefined, NODE_ENV: "production" }, () => {
    assert.equal(resolveSpeechMode(), "mock", "demo — осознанное решение показать продукт вживую");
  });
});

test("off перекрывает всё", () => {
  withEnv({ SPEECH_PROVIDER: "off", SPEECH_URL: "http://127.0.0.1:9000/asr", NODE_ENV: "production" }, () => {
    assert.equal(resolveSpeechMode(), "off");
  });
});

// --- настоящий провайдер, без сети -------------------------------------

/** Подменяет глобальный fetch на время одной проверки. */
async function withFetch(handler, fn) {
  const saved = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(); } finally { globalThis.fetch = saved; }
}

test("gigaam: разбирает ответ сервиса", async () => {
  await withEnv({ SPEECH_URL: "http://127.0.0.1:9000/asr", SPEECH_TOKEN: "secret" }, async () => {
    let seen = null;
    const result = await withFetch(async (url, init) => {
      seen = { url, contentType: init.headers["Content-Type"], auth: init.headers.Authorization, size: init.body.length };
      return new Response(JSON.stringify({ text: "  овсянка и банан  ", confidence: 0.87 }), { status: 200 });
    }, () => new GigaamSpeechProvider().transcribe(ogg(500)));

    assert.equal(result.text, "овсянка и банан", "пробелы по краям срезаются");
    assert.equal(result.confidence, 0.87);
    assert.equal(seen.url, "http://127.0.0.1:9000/asr");
    assert.equal(seen.contentType, "audio/ogg", "сервис должен знать, что за файл ему прислали");
    assert.equal(seen.auth, "Bearer secret");
    assert.equal(seen.size, 500, "уходят ровно наши байты");
  });
});

test("gigaam: без токена заголовка авторизации нет", async () => {
  await withEnv({ SPEECH_URL: "http://127.0.0.1:9000/asr", SPEECH_TOKEN: undefined }, async () => {
    let auth = "не вызывали";
    await withFetch(async (_url, init) => {
      auth = init.headers.Authorization;
      return new Response(JSON.stringify({ text: "творог" }), { status: 200 });
    }, () => new GigaamSpeechProvider().transcribe(ogg(500)));
    assert.equal(auth, undefined);
  });
});

test("gigaam: пустая расшифровка — «не слышно», а не сбой", async () => {
  await withEnv({ SPEECH_URL: "http://127.0.0.1:9000/asr" }, async () => {
    const reason = await withFetch(
      async () => new Response(JSON.stringify({ text: "   " }), { status: 200 }),
      () => reasonOf(new GigaamSpeechProvider().transcribe(ogg(500))),
    );
    assert.equal(reason, "empty");
  });
});

test("gigaam: недоступный сервис и битый ответ — provider_error", async () => {
  await withEnv({ SPEECH_URL: "http://127.0.0.1:9000/asr" }, async () => {
    const unreachable = await withFetch(
      async () => { throw new Error("ECONNREFUSED"); },
      () => reasonOf(new GigaamSpeechProvider().transcribe(ogg(500))),
    );
    assert.equal(unreachable, "provider_error");

    const status500 = await withFetch(
      async () => new Response("boom", { status: 500 }),
      () => reasonOf(new GigaamSpeechProvider().transcribe(ogg(500))),
    );
    assert.equal(status500, "provider_error");

    const garbage = await withFetch(
      async () => new Response("не json", { status: 200 }),
      () => reasonOf(new GigaamSpeechProvider().transcribe(ogg(500))),
    );
    assert.equal(garbage, "provider_error");

    const noText = await withFetch(
      async () => new Response(JSON.stringify({ result: "овсянка" }), { status: 200 }),
      () => reasonOf(new GigaamSpeechProvider().transcribe(ogg(500))),
    );
    assert.equal(noText, "empty", "поле не то — текста нет, значит слушать нечего");
  });
});

test("gigaam: уверенность зажимается в 0…1 и переживает мусор", async () => {
  await withEnv({ SPEECH_URL: "http://127.0.0.1:9000/asr" }, async () => {
    const high = await withFetch(
      async () => new Response(JSON.stringify({ text: "банан", confidence: 5 }), { status: 200 }),
      () => new GigaamSpeechProvider().transcribe(ogg(500)),
    );
    assert.equal(high.confidence, 1);

    const junk = await withFetch(
      async () => new Response(JSON.stringify({ text: "банан", confidence: "высокая" }), { status: 200 }),
      () => new GigaamSpeechProvider().transcribe(ogg(500)),
    );
    assert.equal(junk.confidence, undefined, "мусор лучше отсутствия числа не выдавать за уверенность");
  });
});

test("gigaam: длинная запись не доходит до сети", async () => {
  await withEnv({ SPEECH_URL: "http://127.0.0.1:9000/asr" }, async () => {
    let called = false;
    const reason = await withFetch(
      async () => { called = true; return new Response("{}", { status: 200 }); },
      () => reasonOf(new GigaamSpeechProvider().transcribe({ ...ogg(500), durationSec: 300 })),
    );
    assert.equal(reason, "too_long");
    assert.equal(called, false, "проверять пределы после похода в сеть — значит платить за отказ");
  });
});

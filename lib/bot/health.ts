/**
 * Состояние бота: что он решил при старте и что с ним происходит сейчас.
 *
 * ## Зачем это существует
 *
 * Бот замолчал, и выяснить почему оказалось невозможно. Приложение живо,
 * выкатки зелёные, сайт открывается — а на `/start` тишина. Все ответы
 * лежали на сервере, в логах контейнера, и добраться до них можно было
 * только по SSH и только зная точный каталог.
 *
 * Хуже того: **самая вероятная причина не оставляла в логе ни строчки.**
 * И `startPolling`, и `ensureWebhook` начинались с `if (!token) return` —
 * без токена в окружении бот молча не запускался вовсе, и `grep "[bot]"`
 * по логам выдавал пустоту. Пустой вывод при этом неотличим от «я не туда
 * смотрю», и разбор уходил в сторону.
 *
 * Поэтому здесь два изменения сразу. Первое — молчаливых выходов больше нет
 * (см. вызовы `noteBotState` в polling.ts и ensure-webhook.ts). Второе — всё
 * состояние собрано в одном месте и показывается страницей в админке, где
 * его видно из браузера: без SSH, без docker, без знания путей.
 *
 * ## Что здесь не хранится
 *
 * Ни токена, ни секрета вебхука, ни адреса прокси с ключом. Только факты
 * «задано / не задано» и то, что и так публично: имя бота, режим работы.
 * Страница админки закрыта, но привычку «секретам не место в диагностике»
 * дешевле держать всегда, чем вспоминать о ней в тот день, когда вывод
 * решат кому-нибудь переслать.
 *
 * Состояние живёт в памяти процесса. Перезапуск его обнуляет — и это верно:
 * вопрос «работает ли бот сейчас» относится к текущему процессу, а не к
 * истории.
 */

export type BotTransportMode = "polling" | "webhook";

export type BotState = {
  /** Что выбрал lib/bot/transport.ts. */
  transport: BotTransportMode | null;
  /** Задан ли TELEGRAM_BOT_TOKEN. Без него бот не запускается вовсе. */
  hasToken: boolean;
  /** Задан ли TELEGRAM_API_BASE — от него зависит выбор транспорта. */
  hasApiBase: boolean;
  /** Момент запуска цикла опроса или регистрации вебхука. */
  startedAt: Date | null;
  /** Когда getUpdates последний раз ответил успешно. Сердцебиение опроса. */
  lastPollAt: Date | null;
  /** Когда последний раз пришёл хоть какой-нибудь апдейт. */
  lastUpdateAt: Date | null;
  /** Последняя ошибка с временем — то, ради чего обычно и лезут в логи. */
  lastError: { at: Date; message: string } | null;
  /** Строка, объясняющая, почему бот не запустился. null — запустился. */
  notStartedReason: string | null;
};

const state: BotState = {
  transport: null,
  hasToken: false,
  hasApiBase: false,
  startedAt: null,
  lastPollAt: null,
  lastUpdateAt: null,
  lastError: null,
  notStartedReason: null,
};

export function noteBotStart(transport: BotTransportMode): void {
  state.transport = transport;
  state.hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  state.hasApiBase = Boolean(process.env.TELEGRAM_API_BASE?.trim());
  state.startedAt = new Date();
  state.notStartedReason = null;
}

/** Бот не поднялся. Причина — человеческим текстом, её же увидит админка. */
export function noteBotNotStarted(reason: string): void {
  state.hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
  state.hasApiBase = Boolean(process.env.TELEGRAM_API_BASE?.trim());
  state.notStartedReason = reason;
}

export function notePollOk(updates: number): void {
  state.lastPollAt = new Date();
  if (updates > 0) state.lastUpdateAt = new Date();
}

export function noteBotError(message: string): void {
  state.lastError = { at: new Date(), message };
}

export function botState(): BotState {
  return { ...state };
}

/**
 * Одна строка про то, жив ли бот, — для верхушки страницы админки.
 *
 * Порог в три минуты выведен из устройства опроса, а не назначен: длинный
 * запрос висит 25 секунд (LONG_POLL_SECONDS), а самая долгая пауза после
 * сбоя — минута (MAX_BACKOFF_MS). Три минуты без ответа означают, что цикл
 * не просто ждёт, а действительно застрял.
 */
export function botVerdict(
  now: Date,
  current: BotState = botState(),
  /**
   * То, что видит сам Telegram. Приоритетнее нашего состояния, и это не
   * педантизм.
   *
   * Первая версия судила только по памяти процесса — и ошиблась дважды подряд:
   * модуль состояния попал в два бандла (см. health-store.ts), а `process.env`
   * в коде страницы Next вшил на этапе сборки, из-за чего «токен ПУСТ»
   * печаталось при работающем токене. Оба раза страница уверенно говорила
   * неправду о собственном процессе.
   *
   * А вот очередь на стороне Telegram соврать не может: если там лежат
   * сообщения и вебхука нет, значит `getUpdates` никто не зовёт. Этот вывод
   * не зависит ни от бандлов, ни от того, что мы о себе помним.
   */
  telegram?: { webhookUrl: string | null; pending: number } | null,
): { ok: boolean; text: string } {
  // Очередь копится, а забирать её некому — самый надёжный признак поломки.
  if (telegram && !telegram.webhookUrl && telegram.pending > 0) {
    const stale = !current.lastPollAt || now.getTime() - current.lastPollAt.getTime() > 3 * 60_000;
    if (stale) {
      return {
        ok: false,
        text:
          `Telegram держит ${telegram.pending} непрочитанных сообщений, вебхук не зарегистрирован — `
          + "значит getUpdates никто не вызывает. Токен и канал до Bot API при этом рабочие: "
          + "этот самый запрос через них и прошёл. Остаётся приложение: цикл опроса не поднялся.",
      };
    }
  }

  if (current.notStartedReason) return { ok: false, text: current.notStartedReason };
  if (!current.transport) {
    return {
      ok: false,
      text: "Бот не запускался в этом процессе. Обычно это значит, что не отработал instrumentation.ts.",
    };
  }

  if (current.transport === "webhook") {
    return {
      ok: false,
      text:
        "Режим вебхука. С российского VPS Telegram до нас не достучится — это и есть молчание. "
        + "Проверьте TELEGRAM_API_BASE в .env: пока он пуст, транспорт выбирается вебхуком.",
    };
  }

  if (!current.lastPollAt) {
    return { ok: false, text: "Опрос запущен, но ни один запрос к Telegram ещё не прошёл." };
  }

  const silentMs = now.getTime() - current.lastPollAt.getTime();
  if (silentMs > 3 * 60_000) {
    return { ok: false, text: `Опрос молчит ${Math.round(silentMs / 60_000)} мин — цикл застрял.` };
  }

  return { ok: true, text: "Опрос работает, Telegram отвечает." };
}

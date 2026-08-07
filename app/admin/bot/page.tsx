import { botState, botVerdict } from "@/lib/bot/health";
import { botTransport } from "@/lib/bot/transport";
import { botToken, createTelegramClient } from "@/lib/telegram-api";

/**
 * Состояние бота — страницей, а не строчкой в логе.
 *
 * Написана по факту двухдневного разбора «бот не отвечает на /start», в
 * котором ни разу не удалось добраться до причины. Приложение было живо,
 * выкатки зелёные, сайт открывался, а ответа не было — и всё, что могло бы
 * объяснить почему, лежало в логах контейнера. Дважды присланная диагностика
 * не отработала: команды выполнялись не из каталога проекта, и оба раза
 * вернулось «no configuration file provided».
 *
 * Вывод из этого не «объяснить команды понятнее», а «убрать шаг, на котором
 * ломается». Здесь ровно те же четыре ответа, что даёт связка `docker compose
 * logs` + `getWebhookInfo`, но добывать их не нужно — достаточно открыть
 * страницу.
 *
 * Секретов на странице нет: ни токена, ни адреса прокси, ни секрета вебхука.
 * Только «задано / не задано» и то, что и так публично.
 */
export const dynamic = "force-dynamic";

type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  ip_address?: string;
};

const time = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium" });

function ago(from: Date | null, now: Date): string {
  if (!from) return "—";
  const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  if (seconds < 90) return `${seconds} с назад`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} мин назад`;
  return `${Math.round(minutes / 60)} ч назад`;
}

/**
 * Что Telegram думает о доставке. Единственный внешний запрос на странице, и
 * он идёт через тот же клиент и тот же прокси, что и весь бот, — то есть
 * заодно проверяет сам канал: если прокси лежит, мы это здесь и увидим.
 */
async function fetchWebhookInfo(): Promise<{ info: WebhookInfo | null; error: string | null }> {
  const token = botToken();
  if (!token) return { info: null, error: "токена нет" };
  try {
    const info = await createTelegramClient(token).call<WebhookInfo>("getWebhookInfo", {});
    return { info, error: null };
  } catch (error) {
    return { info: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function AdminBotPage() {
  const now = new Date();
  const state = botState();
  const verdict = botVerdict(now, state);
  const { info, error } = await fetchWebhookInfo();
  const configured = botTransport();

  return <div className="adm-page">
    <h1 className="adm-title">Бот</h1>

    <p className={verdict.ok ? "adm-banner" : "adm-banner adm-banner--bad"}>
      <strong>{verdict.ok ? "Работает." : "Не работает."}</strong> {verdict.text}
    </p>

    <section className="adm-section">
      <h2>Что решило приложение при старте</h2>
      <table className="adm-table">
        <tbody>
          <tr>
            <th>Транспорт</th>
            <td>
              {state.transport ?? "не запускался"}
              {state.transport && state.transport !== configured &&
                <> — но настройки сейчас велят <b>{configured}</b>, значит контейнер перезапускали не после правки .env</>}
            </td>
          </tr>
          <tr>
            <th>TELEGRAM_BOT_TOKEN</th>
            <td>{state.hasToken ? "задан" : "ПУСТ — бот не поднимется вовсе"}</td>
          </tr>
          <tr>
            <th>TELEGRAM_API_BASE</th>
            <td>
              {state.hasApiBase
                ? "задан — исходящие идут через прокси, транспорт опрос"
                : "ПУСТ — транспорт выбирается вебхуком, а до нашего VPS Telegram не достучится"}
            </td>
          </tr>
          <tr><th>Запущен</th><td>{state.startedAt ? `${time.format(state.startedAt)} (${ago(state.startedAt, now)})` : "—"}</td></tr>
        </tbody>
      </table>
      {state.notStartedReason && <p className="adm-muted">Причина отказа: {state.notStartedReason}</p>}
    </section>

    <section className="adm-section">
      <h2>Сердцебиение опроса</h2>
      <p className="adm-section-lead">
        Длинный запрос к Telegram висит 25 секунд, самая долгая пауза после сбоя — минута.
        Значит «последний ответ» свежее трёх минут — норма, а больше — цикл застрял.
      </p>
      <table className="adm-table">
        <tbody>
          <tr><th>Последний ответ Telegram</th><td>{state.lastPollAt ? `${time.format(state.lastPollAt)} (${ago(state.lastPollAt, now)})` : "ни одного"}</td></tr>
          <tr><th>Последнее входящее сообщение</th><td>{state.lastUpdateAt ? `${time.format(state.lastUpdateAt)} (${ago(state.lastUpdateAt, now)})` : "ни одного"}</td></tr>
          <tr>
            <th>Последняя ошибка</th>
            <td>{state.lastError ? `${time.format(state.lastError.at)} — ${state.lastError.message}` : "нет"}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section className="adm-section">
      <h2>Что говорит Telegram</h2>
      {error && <p className="adm-muted">
        Запрос к Bot API не прошёл: {error}. Это уже ответ: канал до Telegram не работает, и
        дело не в коде бота, а в доступности прокси.
      </p>}
      {info && <table className="adm-table">
        <tbody>
          <tr>
            <th>Зарегистрированный вебхук</th>
            <td>
              {info.url
                ? <>{info.url} — <b>это проблема при опросе</b>: пока вебхук стоит, getUpdates отвечает 409</>
                : "нет — как и должно быть при опросе"}
            </td>
          </tr>
          <tr><th>Недоставленных сообщений в очереди</th><td>{info.pending_update_count ?? 0}</td></tr>
          <tr>
            <th>Последняя ошибка доставки</th>
            <td>
              {info.last_error_message
                ? `${info.last_error_message}${info.last_error_date ? ` (${time.format(new Date(info.last_error_date * 1000))})` : ""}`
                : "нет"}
            </td>
          </tr>
        </tbody>
      </table>}
    </section>
  </div>;
}

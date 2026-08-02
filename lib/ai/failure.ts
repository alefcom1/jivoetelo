/**
 * Разбор ошибки обращения к модели — в одну читаемую строку.
 *
 * ## Зачем
 *
 * `console.error("...", error)` печатает объект целиком, и в нём тонет
 * ровно то, ради чего в лог и лезут: что именно случилось. У ошибок SDK
 * Anthropic полезное лежит в разных местах — статус в одном поле, причина
 * во вложенном `cause`, — а строк вывода при этом десятки.
 *
 * Разбор фото уже дважды чинили вслепую: сперва не тот идентификатор модели,
 * потом `effort`, который haiku не понимает. Оба раза лог говорил
 * «request failed» и ни слова о том, почему. Здесь — модель, операция и
 * различимая причина, чтобы третьего раза вслепую не было.
 */

export type AiFailure = {
  /** Короткий вид отказа — по нему и ищут в логе. */
  kind: "timeout" | "aborted" | "network" | "http" | "unknown";
  status?: number;
  message: string;
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Самая глубокая причина в цепочке `cause`.
 *
 * Одного уровня мало, и это выяснилось дорого. `fetch` в undici бросает
 * `TypeError: fetch failed`, а настоящая причина — `getaddrinfo ENOTFOUND`,
 * `ECONNREFUSED`, ошибка сертификата — лежит уровнем ниже. SDK Anthropic
 * добавляет сверху третий: `APIConnectionError: Connection error.`.
 *
 * Разбор, читавший ровно один `cause`, печатал в лог «Connection error.
 * (fetch failed)» — то есть ровно то бесполезное сообщение, ради замены
 * которого этот модуль и написан. Прокси лежал, а по логу это было не
 * отличить ни от сбоя DNS, ни от протухшего сертификата.
 *
 * `seen` — не паранойя: цепочка `cause` может замкнуться на себя, и обход
 * без метки посещённых зациклил бы процесс, который просто писал в лог.
 */
function rootCause(error: unknown): { message: string; code?: string } {
  let current: unknown = error;
  let deepest = { message: messageOf(error), code: codeOf(error) };
  const seen = new Set<unknown>();

  while (current instanceof Error && current.cause !== undefined && !seen.has(current)) {
    seen.add(current);
    current = current.cause;
    if (current instanceof Error) deepest = { message: current.message, code: codeOf(current) };
  }
  return deepest;
}

/**
 * Причина обрыва связи одной строкой: код, если он есть и не повторяет текст,
 * и само сообщение. Пусто, когда глубже верхнего уровня ничего не нашлось.
 */
export function networkDetail(error: unknown): string {
  const root = rootCause(error);
  if (root.message === messageOf(error)) return "";
  const code = root.code && !root.message.includes(root.code) ? `${root.code} ` : "";
  return ` (${code}${root.message})`;
}

/**
 * Отличает «не дождались» от «не доехали» и от «сервер ответил отказом».
 *
 * Это три разные починки, и путать их дорого: на таймаут отвечают временем,
 * на отказ сервера — исправлением запроса, а на обрыв связи — транспортом.
 */
export function describeAiFailure(error: unknown): AiFailure {
  const record = error as { status?: unknown; name?: unknown; cause?: unknown; error?: unknown };
  const status = typeof record?.status === "number" ? record.status : undefined;
  const name = typeof record?.name === "string" ? record.name : "";
  const text = messageOf(error);

  if (name === "TimeoutError" || /timed? ?out/i.test(text)) {
    return { kind: "timeout", status, message: text };
  }
  if (name === "AbortError") return { kind: "aborted", status, message: text };
  if (status !== undefined) {
    // У SDK текст отказа лежит во вложенном объекте — без него в логе
    // остаётся голый номер, по которому ничего не понять.
    const detail = (record.error as { error?: { message?: string } } | undefined)?.error?.message;
    return { kind: "http", status, message: detail ? `${text} — ${detail}` : text };
  }
  if (name === "APIConnectionError" || /connect|socket|ECONN|EAI_AGAIN|fetch failed/i.test(text)) {
    return { kind: "network", status, message: text + networkDetail(error) };
  }
  return { kind: "unknown", status, message: text };
}

/**
 * Одна строка в лог: где, на какой модели, сколько ждали и что сломалось.
 *
 * Время обязательно. «Request timed out» без него не отвечает на главный
 * вопрос — модель думала минуту или две, — а от ответа зависит, поднимать
 * предел или уменьшать задачу. Мы этот вопрос уже задавали и не смогли
 * ответить по логу.
 */
export function logAiFailure(operation: string, model: string, error: unknown, startedAt?: number): AiFailure {
  const failure = describeAiFailure(error);
  const elapsed = startedAt ? ` за ${Math.round((Date.now() - startedAt) / 1000)} с` : "";
  console.error(
    `[ai] ${operation} на ${model}: ${failure.kind}` +
    `${failure.status ? ` ${failure.status}` : ""}${elapsed} — ${failure.message}`,
  );
  return failure;
}

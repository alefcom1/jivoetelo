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
    const cause = record.cause instanceof Error ? ` (${record.cause.message})` : "";
    return { kind: "network", status, message: text + cause };
  }
  return { kind: "unknown", status, message: text };
}

/** Одна строка в лог: где, на какой модели и что именно сломалось. */
export function logAiFailure(operation: string, model: string, error: unknown): AiFailure {
  const failure = describeAiFailure(error);
  console.error(
    `[ai] ${operation} на ${model}: ${failure.kind}` +
    `${failure.status ? ` ${failure.status}` : ""} — ${failure.message}`,
  );
  return failure;
}

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Unitpay: подпись и разбор запросов. Чистый модуль без обращений к БД —
 * подпись обязана быть точной, поэтому она изолирована и покрыта тестами.
 *
 * Алгоритм (эталон — официальный модуль Unitpay):
 *  - берём значения параметров, кроме `sign` и `signature`;
 *  - сортируем по имени параметра (ksort);
 *  - склеиваем значения разделителем `{up}`;
 *  - для обработчика впереди добавляем method, в конце — secretKey;
 *  - sha256 в hex.
 */

const DELIMITER = "{up}";

/** Подпись формы оплаты: sha256(account{up}[currency{up}]desc{up}sum{up}secretKey). */
export function formSignature(
  params: { account: string; desc: string; sum: string; currency?: string },
  secretKey: string,
): string {
  // Порядок — алфавитный по имени параметра: account, currency, desc, sum.
  // currency участвует, только если реально передаётся в форму.
  const values = [params.account, ...(params.currency ? [params.currency] : []), params.desc, params.sum];
  return sha256([...values, secretKey].join(DELIMITER));
}

/** Подпись обработчика: sha256(method{up}<значения по алфавиту>{up}secretKey). */
export function handlerSignature(
  method: string,
  params: Record<string, string>,
  secretKey: string,
): string {
  const values = Object.keys(params)
    .filter((key) => key !== "sign" && key !== "signature")
    .sort()
    .map((key) => params[key]);
  return sha256([method, ...values, secretKey].join(DELIMITER));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Сравнение подписей за постоянное время — чтобы не подбирали побайтово. */
export function signaturesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type UnitpayMethod = "check" | "pay" | "error";

export type UnitpayRequest = {
  method: UnitpayMethod;
  params: Record<string, string>;
  /** Идентификатор платежа в Unitpay — ключ идемпотентности. */
  unitpayId: string;
  /** Наш идентификатор плательщика (передаём userId при создании платежа). */
  account: string;
  sum: string;
};

export type UnitpayParseFailure = { ok: false; reason: "bad_method" | "bad_params" | "bad_signature" };
export type UnitpayParseResult = { ok: true; request: UnitpayRequest } | UnitpayParseFailure;

const METHODS: UnitpayMethod[] = ["check", "pay", "error"];

/**
 * Разбирает и проверяет входящий запрос обработчика.
 * Формат Unitpay: `?method=pay&params[unitpayId]=...&params[account]=...`
 */
export function parseHandlerRequest(searchParams: URLSearchParams, secretKey: string): UnitpayParseResult {
  const method = searchParams.get("method") ?? "";
  if (!METHODS.includes(method as UnitpayMethod)) return { ok: false, reason: "bad_method" };

  const params: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    const match = /^params\[(.+)\]$/.exec(key);
    if (match) params[match[1]] = value;
  }

  const received = params.signature ?? "";
  const { unitpayId, account, sum } = params;
  if (!received || !unitpayId || !account || !sum) return { ok: false, reason: "bad_params" };

  const expected = handlerSignature(method, params, secretKey);
  if (!signaturesMatch(expected, received)) return { ok: false, reason: "bad_signature" };

  return {
    ok: true,
    request: { method: method as UnitpayMethod, params, unitpayId, account, sum },
  };
}

/** Ответ обработчика в формате JSON-RPC, как ожидает Unitpay. */
export function handlerSuccess(message: string) {
  return { jsonrpc: "2.0", result: { message }, id: 1 };
}

export function handlerError(message: string) {
  return { jsonrpc: "2.0", error: { code: -32000, message }, id: 1 };
}

/**
 * Ссылка на форму оплаты. Сумма — строка, чтобы не потерять копейки на
 * плавающей точке: подпись считается ровно по той строке, что уйдёт в URL.
 */
export function paymentUrl(input: {
  publicKey: string;
  secretKey: string;
  account: string;
  sum: string;
  desc: string;
  currency?: string;
}): string {
  const url = new URL(`https://unitpay.ru/pay/${input.publicKey}`);
  url.searchParams.set("account", input.account);
  url.searchParams.set("sum", input.sum);
  url.searchParams.set("desc", input.desc);
  if (input.currency) url.searchParams.set("currency", input.currency);
  url.searchParams.set(
    "signature",
    formSignature(
      { account: input.account, sum: input.sum, desc: input.desc, currency: input.currency },
      input.secretKey,
    ),
  );
  return url.toString();
}

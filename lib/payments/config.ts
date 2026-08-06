/**
 * Приём оплаты подготовлен, но выключен: сейчас все функции бесплатны.
 * Включается одной переменной, когда решим монетизировать (docs/payments.md).
 */

export type PaymentsConfig = {
  enabled: boolean;
  publicKey: string;
  secretKey: string;
};

export function getPaymentsConfig(): PaymentsConfig | null {
  const publicKey = process.env.UNITPAY_PUBLIC_KEY;
  const secretKey = process.env.UNITPAY_SECRET_KEY;
  // PAYMENTS_ENABLED должен быть выставлен явно: без него ключи в окружении
  // ничего не включают — защита от случайного приёма денег.
  const enabled = process.env.PAYMENTS_ENABLED === "true";
  if (!publicKey || !secretKey) return null;
  return { enabled, publicKey, secretKey };
}

/**
 * Принимаем ли мы деньги вообще — любым провайдером.
 *
 * Вопрос задаёт оферта, и ей неважно, чей это обработчик: ей важно, врёт ли
 * страница, когда пишет «оплата принимается». Провайдеров у нас два (рабочий
 * Tribute и оставленный про запас Unitpay), и проверка только одного из них
 * означала бы, что документ рассказывает про приём оплаты по состоянию
 * чужого, неиспользуемого маршрута.
 */
export function paymentsEnabled(): boolean {
  if (getPaymentsConfig()?.enabled === true) return true;
  // Импорт по месту, а не сверху: модуль Tribute тянет node:crypto, а этот
  // читают и из клиентских страниц.
  const tributeReady = Boolean(
    process.env.TRIBUTE_API_KEY?.trim()
    && process.env.TRIBUTE_LINK_MONTH?.trim()
    && process.env.TRIBUTE_LINK_YEAR?.trim(),
  );
  return tributeReady && process.env.PAYMENTS_ENABLED === "true";
}

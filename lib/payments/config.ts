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

export function paymentsEnabled(): boolean {
  return getPaymentsConfig()?.enabled === true;
}

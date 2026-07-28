"use server";

import { subscribeToSeries } from "@/lib/email-subscribe";
import { normalizeEmail } from "@/lib/email";
import { parseSeriesContext } from "@/lib/email-series";
import { LEGAL_VERSION } from "@/lib/legal";

export type SubscribeState = {
  status: "idle" | "success" | "invalid" | "no_consent" | "bad_context" | "error";
  /**
   * Введённый адрес возвращается вместе с ошибкой: React после server action
   * сбрасывает неконтролируемую форму, и человек, забывший отметить
   * согласие, обнаружил бы пустое поле.
   */
  email?: string;
  consent?: boolean;
};

/**
 * Подписка на разбор расчёта по почте. Числа приходят из формы скрытыми
 * полями, а не пересчитываются на сервере: пересчёт потребовал бы передать
 * сюда рост, вес, возраст и активность — то есть собрать о человеке больше
 * данных, чем нужно для трёх писем.
 *
 * Клиентским числам мы при этом не верим на слово: `parseSeriesContext`
 * проверяет их согласованность, и письмо с «2000–1740» не уедет.
 */
export async function subscribeToBreakdown(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  const typed = String(formData.get("email") ?? "");
  const consent = formData.get("consent") === "on";
  const email = normalizeEmail(typed);
  if (!email) return { status: "invalid", email: typed, consent };
  if (!consent) return { status: "no_consent", email: typed, consent };

  const context = parseSeriesContext({
    kcalTarget: formData.get("kcalTarget"),
    kcalMin: formData.get("kcalMin"),
    kcalMax: formData.get("kcalMax"),
    proteinTarget: formData.get("proteinTarget"),
  });
  if (!context) return { status: "bad_context", email: typed, consent };

  try {
    // Повторная подписка активного адреса возвращает тот же успех: сообщать,
    // что адрес уже в базе, значит раскрывать чужие подписки.
    await subscribeToSeries({
      email,
      source: "raschet_energiya",
      consentVersion: LEGAL_VERSION,
      context,
      now: new Date(),
    });
    return { status: "success" };
  } catch (error) {
    console.error("email series subscribe failed", error);
    return { status: "error", email: typed, consent };
  }
}

import { mascotImage, mascotPose, mascotSpeech, MOOD_LABELS } from "@/lib/mascot";
import type { StreakResult } from "@/lib/streak";

/**
 * Живело в веб-кабинете.
 *
 * До этого серия жила только в Mini App, и человек с ноутбука не видел ни
 * счётчика, ни вех — при том что вехи открывают ему разделы. Одно и то же
 * состояние в двух клиентах должно выглядеть одинаково.
 *
 * Серверный компонент: числа считаются на сервере, текст собирается тут же
 * (lib/mascot.ts) — интерактивности здесь нет вовсе, значит и клиентского
 * кода быть не должно.
 */
export function StreakStrip({ streak }: { streak: StreakResult }) {
  const speech = mascotSpeech(streak);

  return <section className="streak-strip">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={mascotImage(mascotPose(speech))} alt={MOOD_LABELS[speech.mood]} width={288} height={288} />
    <div>
      <b>{speech.title}</b>
      <p>{speech.note}</p>
      {speech.milestone && <em>{speech.milestone}</em>}
    </div>
  </section>;
}

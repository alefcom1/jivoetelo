"use client";

// Реплика Живело по поводу — общий вид для всех мест, где он появляется
// вне карточки серии.
//
// ## Зачем отдельный компонент
//
// Поводов стало много (разбор, сбой, пустой день, возвращение), и без общего
// места каждый экран нарисовал бы енота по-своему: где-то 76 пикселей, где-то
// 48, где-то с анимацией, где-то без. Персонаж, который на разных экранах
// выглядит по-разному, перестаёт читаться как один персонаж.
//
// ## Про анимацию
//
// Позы — статические webp, и это сознательно: анимированный формат весил бы
// в разы больше ради движения, которое всё равно нужно только в момент
// появления. Движение делает CSS (`tg.css`, блок «Живело: движение»):
// появление со сдвигом вверх, очень медленное «дыхание» в покое и короткий
// толчок при смене позы.
//
// Всё это выключается при `prefers-reduced-motion: reduce` — не как уступка
// формальности, а по существу: анимация в приложении о питании не должна
// мешать людям, которым движение на экране физически неприятно.

import { mascotEventLine, MOOD_LABELS, mascotImage, type MascotEvent } from "@/lib/mascot";

export function MascotSay({ event, compact }: { event: MascotEvent; compact?: boolean }) {
  const line = mascotEventLine(event);
  if (!line) return null;

  return <div className={compact ? "tg-say tg-say-compact" : "tg-say"} role="status">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      className="tg-say-mascot"
      // Ключ по позе: React заменит узел при смене позы, и анимация появления
      // проиграется заново. Без него смена позы прошла бы незаметно.
      key={line.pose}
      src={mascotImage(line.pose)}
      alt=""
      aria-hidden
      width={288}
      height={288}
    />
    <p>{line.text}</p>
  </div>;
}

/** Описание позы словами — там, где картинка несёт смысл сама по себе. */
export function poseLabel(pose: keyof typeof MOOD_LABELS | string): string {
  return typeof pose === "string" && pose in MOOD_LABELS
    ? MOOD_LABELS[pose as keyof typeof MOOD_LABELS]
    : "Живело";
}

"use client";

// Карточка Живело на «Сегодня»: енот слева, состояние серии справа.
//
// Почему узкой полосой, а не полноценным блоком. Главный объект экрана —
// кольцо энергии, и карточка стоит прямо над ним. Всё, что выше кольца,
// отодвигает его вниз, поэтому здесь ровно две строки текста и картинка в
// 72 пикселя: присутствие есть, первого экрана она не съедает.
//
// Числа приходят с сервера (lib/streak.ts), текст собирается здесь
// (lib/mascot.ts). Разделение не случайное: считать серию на клиенте значило
// бы отдавать туда все даты записей, а хранить реплики персонажа на сервере —
// разносить его голос по двум местам.

import { mascotSpeech, MOOD_LABELS } from "@/lib/mascot";
import type { StreakResult } from "@/lib/streak";
import { ArtRaccoon } from "./illustrations";

export function StreakCard({ streak }: { streak: StreakResult }) {
  const speech = mascotSpeech(streak);

  return <section className="tg-card tg-streak">
    <ArtRaccoon mood={speech.mood} label={MOOD_LABELS[speech.mood]} />
    <div className="tg-streak-body">
      <b>{speech.title}</b>
      <p>{speech.note}</p>
      {/* Веха появляется ровно в тот день, когда взята, и говорит не «молодец»,
          а что именно открылось. */}
      {speech.milestone && <em>{speech.milestone}</em>}
    </div>
  </section>;
}

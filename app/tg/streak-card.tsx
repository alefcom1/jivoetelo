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
//
// Картинка — обычный <img>, а не next/image: файл маленький, ровно один на
// экран, и оптимизатор Next тут добавил бы только запрос к своему эндпоинту.
// Позы лежат в public/mascot и режутся скриптом scripts/cut-mascot.py.

import { mascotImage, mascotPose, mascotSpeech, MOOD_LABELS } from "@/lib/mascot";
import type { StreakResult } from "@/lib/streak";

export function StreakCard({ streak }: { streak: StreakResult }) {
  const speech = mascotSpeech(streak);

  return <section className="tg-card tg-streak">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="tg-mascot" src={mascotImage(mascotPose(speech))} alt={MOOD_LABELS[speech.mood]}
      width={288} height={288} />
    <div className="tg-streak-body">
      <b>{speech.title}</b>
      <p>{speech.note}</p>
      {/* Веха появляется ровно в тот день, когда взята, и говорит не «молодец»,
          а что именно открылось. */}
      {speech.milestone && <em>{speech.milestone}</em>}
    </div>
  </section>;
}

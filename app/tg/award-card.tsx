"use client";

// Карточка взятой награды на «Сегодня».
//
// Показывается в день взятия и на месте карточки серии — по тому же правилу
// «одна реплика Живело за раз», что и подсказки первых шагов. Награда,
// карточка серии и подсказка — три сообщения от одного персонажа, и рядом они
// читаются как поток, а не как событие.
//
// Кнопка «поделиться» стоит именно здесь, а не постоянно на экране. Постоянная
// кнопка «расскажите о нас» — это просьба; кнопка на карточке награды —
// предложение показать то, что у человека вышло. Разница в том, кто кому
// делает одолжение.

import { mascotImage } from "@/lib/mascot";

export type FreshAward = { key: string; title: string; note: string };

export function AwardCard({ award, onShare }: { award: FreshAward; onShare: () => void }) {
  return <section className="tg-award" role="status">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="tg-award-mascot" src={mascotImage("cheer")} alt="" aria-hidden width={288} height={288} />
    <div className="tg-award-body">
      <b>{award.title}</b>
      <p>{award.note}</p>
      <button className="tg-award-share" onClick={onShare}>Отправить другу →</button>
    </div>
  </section>;
}

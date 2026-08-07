"use client";

import Link from "next/link";
import { ACCESS_ANCHOR, type AccessOffer } from "@/lib/paid";

/**
 * Отказ с выходом, а не отказ-тупик.
 *
 * Обычная ошибка («выберите фото», «модель не ответила») печатается строкой и
 * этого достаточно: человек знает, что делать. Отказ «пробный месяц
 * закончился» — другой: он про решение, которое нужно принять, и решение это
 * стоит денег.
 *
 * Раньше на этом месте была та же строка, отправлявшая искать раздел
 * настроек. Между «хочу разобрать фотографию» и «плачу» стояла навигация по
 * интерфейсу — а это ровно тот момент, когда человек готов заплатить: он
 * только что попробовал и не смог.
 *
 * Кнопка одна, самая дешёвая. Две кнопки с ценами превращают сообщение об
 * отказе в прейскурант, а годовой тариф человек выберет осознанно и в
 * «Доступе», куда ведёт вторая, тихая строка — там же ваучер и приглашение.
 */
export function AccessError({ error, access }: { error: string; access?: AccessOffer }) {
  if (!error) return null;
  // access === undefined — отказ не про доступ (дневной лимит, слишком часто).
  // access === null — доступа нет, но приём денег выключен: платить нечем, и
  // кнопка вела бы в никуда. Остаётся путь через приглашение, он в «Доступе».
  if (access === undefined) return <p className="form-error">{error}</p>;

  return <div className="access-error">
    <p className="form-error">{error}</p>
    {access && <a className="black-button" href={access.payUrl} target="_blank" rel="noopener noreferrer">
      {access.payLabel}
    </a>}
    <p className="field-note">
      <Link href={`/app/settings#${ACCESS_ANCHOR}`}>
        {access ? "Другие варианты — годовой доступ, код, приглашение друга" : "Как открыть разбор — в разделе «Доступ»"}
      </Link>
    </p>
  </div>;
}

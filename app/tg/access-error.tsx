"use client";

import type { AccessOffer } from "@/lib/paid";
import { haptic, openExternal } from "./telegram";

/**
 * Отказ с выходом — версия для Mini App.
 *
 * Отличий от веб-варианта два, и оба вынужденные. Оплата уходит наружу через
 * `openExternal`, а не обычной ссылкой: так деньги принимает Tribute, а не наш
 * бот, и правило Telegram о продаже цифровых товаров за Stars остаётся его
 * заботой. А «другие варианты» — не ссылка, а переключение на вкладку
 * профиля: внутри Mini App своя навигация, и уводить человека в браузер
 * ради раздела, который есть здесь же, незачем.
 */
export function TgAccessError({
  error,
  access,
  onOpenAccess,
}: {
  error: string;
  access?: AccessOffer;
  onOpenAccess?: () => void;
}) {
  if (!error) return null;
  // undefined — отказ не про доступ (дневной лимит, слишком часто): звать
  // платить того, у кого доступ открыт, значит не знать, с кем говоришь.
  if (access === undefined) return <p className="tg-error">{error}</p>;

  return <div className="tg-access-error">
    <p className="tg-error">{error}</p>
    {access && <button
      className="tg-button tg-button-block"
      onClick={() => { haptic("tap"); openExternal(access.payUrl); }}
    >
      {access.payLabel}
    </button>}
    {onOpenAccess && <button className="tg-link-button" onClick={() => { haptic("tap"); onOpenAccess(); }}>
      {access ? "Другие варианты — год, код, приглашение друга" : "Как открыть разбор"}
    </button>}
  </div>;
}

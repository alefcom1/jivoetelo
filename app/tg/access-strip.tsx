"use client";

import type { TodayResponse } from "./api";
import { haptic, openExternal } from "./telegram";

/**
 * Полоса о доступе на вкладке «Сегодня».
 *
 * Тот же смысл, что у веб-версии (app/app/access-strip.tsx), и те же правила
 * появления — считает их сервер общим модулем lib/access-prompt.ts. Здесь
 * только разметка: два интерфейса, одно правило.
 *
 * Отличий от веба два, и оба вынужденные. Оплата уходит наружу через
 * `openExternal`: так деньги принимает Tribute, а не наш бот. А приглашение —
 * не ссылка на настройки, а переход на вкладку профиля: внутри Mini App своя
 * навигация, и выкидывать человека в браузер за тем, что есть здесь же,
 * незачем.
 */
export function TgAccessStrip({
  access,
  onOpenAccess,
}: {
  access: NonNullable<TodayResponse["access"]>;
  onOpenAccess: () => void;
}) {
  // Ссылку берём в переменную: внутри обработчика TypeScript уже не помнит
  // про проверку на null — замыкание могло бы прочитать поле позже.
  const payUrl = access.payUrl;

  return <section className={access.closed ? "tg-access-strip tg-access-strip--closed" : "tg-access-strip"}>
    <p className="tg-access-strip-title">{access.title}</p>
    <p className="tg-hint">{access.body}</p>
    <div className="tg-access-strip-actions">
      {payUrl && <button
        className="tg-button tg-button-block"
        onClick={() => { haptic("tap"); openExternal(payUrl); }}
      >
        {access.closed ? "Открыть разбор" : "Продлить"} — {access.payPriceRub} ₽
      </button>}
      {/* Приглашение показываем всегда, даже когда приём денег выключен: это
          не «а ещё у нас есть реферальная программа», а второй полноценный
          способ продлить доступ — бесплатный и без потолка. */}
      <button className="tg-link-button" onClick={() => { haptic("tap"); onOpenAccess(); }}>
        Позвать друга — месяц бесплатно
      </button>
    </div>
  </section>;
}

"use client";

// Подсказка первых шагов в веб-кабинете.
//
// Тот же персонаж и тот же текст, что в Mini App (`lib/first-run.ts`), но
// своя разметка: в Mini App это вкладки, здесь маршруты. Общий у поверхностей
// модуль правил, а не компонент — попытка сделать одну кнопку на две
// разметки стоила бы больше, чем два простых компонента.
//
// Клиентский, потому что подсказку надо уметь закрыть, не перезагружая
// страницу. Скрываем сразу, отметку на сервер отправляем следом: ждать ответа
// ради того, чтобы убрать строку, человеку незачем.

import Link from "next/link";
import { useState } from "react";
import type { Hint } from "@/lib/first-run";
import { mascotImage } from "@/lib/mascot";
import { markHints } from "./hint-actions";

/** Куда ведёт намерение шага в вебе. У Mini App свои вкладки. */
const HREF: Record<NonNullable<Hint["action"]>["target"], string> = {
  camera: "/app/add",
  // «Дневник» в вебе — это сам экран дня со стрелками, отдельного нет.
  diary: "/app",
  week: "/app/review",
  weight: "/app/weight",
  profile: "/app/settings",
};

export function FirstRunHint({ hint }: { hint: Hint }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    void markHints([hint.key]);
  };

  return <section className="first-hint" role="status">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={mascotImage(hint.pose)} alt="" aria-hidden width={288} height={288} />
    <div>
      <p>{hint.text}</p>
      {hint.action && <Link className="first-hint-action" href={HREF[hint.action.target]} onClick={dismiss}>
        {hint.action.label} →
      </Link>}
    </div>
    <button onClick={dismiss} aria-label="Скрыть подсказку">×</button>
  </section>;
}

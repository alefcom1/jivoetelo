"use client";

// Подсказка первых шагов на «Сегодня».
//
// Отличается от `MascotSay` двумя вещами, из-за которых и заведён отдельный
// компонент: у подсказки есть крестик (закрытая не возвращается никогда) и
// бывает кнопка перехода туда, о чём речь.
//
// Показывается ровно одна за раз. Две подсказки на экране — это уже не
// объяснение, а поток сообщений; правило записано в docs/first-run.md и
// обеспечивается тем, что `nextHint` возвращает одну.

import { mascotImage, type MascotPose } from "@/lib/mascot";
import type { Hint } from "@/lib/first-run";

export function FirstRunHint({
  hint,
  onDismiss,
  onAction,
}: {
  hint: Hint;
  onDismiss: () => void;
  onAction: (tab: NonNullable<Hint["action"]>["tab"]) => void;
}) {
  return <section className="tg-hint-card" role="status">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      className="tg-hint-mascot"
      key={hint.pose as MascotPose}
      src={mascotImage(hint.pose)}
      alt=""
      aria-hidden
      width={288}
      height={288}
    />
    <div className="tg-hint-body">
      <p>{hint.text}</p>
      {hint.action && <button className="tg-hint-action" onClick={() => onAction(hint.action!.tab)}>
        {hint.action.label} →
      </button>}
    </div>
    <button className="tg-hint-close" onClick={onDismiss} aria-label="Скрыть подсказку">×</button>
  </section>;
}

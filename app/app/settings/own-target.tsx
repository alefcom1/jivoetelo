"use client";

import { useActionState } from "react";
import type { TargetStep, Targets } from "@/lib/targets";
import { MAX_KCAL_OVERRIDE, MIN_KCAL_OVERRIDE } from "@/lib/onboarding";
import { saveOwnTarget, type OwnTargetState } from "../profile-actions";

/**
 * Норма калорий: откуда взялась и как задать свою.
 *
 * Два дела в одном блоке намеренно. Своя норма нужна тому, кто не согласен с
 * расчётной, а несогласие возникает только после того, как человек увидел,
 * из чего она сложилась. Разносить это по разным экранам значило бы сначала
 * показать число без объяснений, а потом отдельно спросить, устраивает ли
 * оно.
 */
export function OwnTarget({ targets, steps }: { targets: Targets; steps: TargetStep[] }) {
  const [state, action, pending] = useActionState<OwnTargetState, FormData>(saveOwnTarget, { status: "idle" });
  const manual = targets.source === "manual";

  return <div className="own-target">
    <p className="own-target-value">
      {manual
        ? <><strong>{targets.kcalTarget}</strong> ккал — ваша норма</>
        : <><strong>{targets.kcalMin}–{targets.kcalMax}</strong> ккал в день</>}
    </p>

    <details className="own-target-explain">
      <summary>Откуда это число</summary>
      <ol>
        {steps.map((step, index) => <li key={index}>
          <b>{step.kcal}</b>
          <span>{step.label}</span>
          {step.note && <i>{step.note}</i>}
        </li>)}
      </ol>
      {!manual && <p className="field-note">
        Диапазон, а не точка: формула Миффлина–Сан Жеора даёт оценку, а не измерение.
        Между двумя людьми одного роста, веса и возраста расход отличается до 15%,
        и формула этой разницы не знает.
      </p>}
    </details>

    <form action={action} className="own-target-form">
      <label>
        Своя норма, ккал
        <input
          type="number" name="kcalOverride" inputMode="numeric"
          min={MIN_KCAL_OVERRIDE} max={MAX_KCAL_OVERRIDE} step={10}
          defaultValue={manual ? targets.kcalTarget : ""}
          placeholder="считаем по формуле"
        />
      </label>
      <button className="black-button" type="submit" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </button>
    </form>

    <p className="field-note">
      {manual
        ? "Формула и адаптивная поправка отключены. Очистите поле и сохраните, чтобы вернуть расчёт."
        : "Заполните, если норму назначил врач или тренер: тогда расчёт отключится, а число останется вашим."}
    </p>

    {state.status === "invalid" &&
      <p className="form-error">Норма должна быть от {MIN_KCAL_OVERRIDE} до {MAX_KCAL_OVERRIDE} ккал.</p>}
    {state.status === "error" && <p className="form-error">Не получилось сохранить. Попробуйте ещё раз.</p>}
    {state.status === "saved" && <p className="field-note">Сохранено.</p>}
  </div>;
}

"use client";

import { useState } from "react";
import { formatMl, MAX_ENTRY_ML, MIN_ENTRY_ML, QUICK_ADDS, waterNote } from "@/lib/water-log";
import { addWater, undoWater, type TgWaterDay } from "./api";
import { haptic } from "./telegram";

/**
 * Счётчик жидкости на «Сегодня».
 *
 * Считаем жидкость целиком — чай, кофе, суп: делить на «воду» и «не воду»
 * значило бы повторять миф, против которого стоит и сам расчёт нормы
 * (lib/water.ts). Полоса не краснеет и не хвалит: недопитый стакан не
 * проступок, а лишний — не достижение.
 *
 * Состояние держится здесь и обновляется ответом сервера, а не перезагрузкой
 * всего экрана: нажатие на «Стакан» обязано отзываться мгновенно, иначе по
 * кнопке жмут дважды.
 */
export function WaterCard({ initial }: { initial: TgWaterDay }) {
  const [water, setWater] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [own, setOwn] = useState("");
  const [failed, setFailed] = useState(false);

  const { drunkMl, goalMl, foodMl, canUndo } = water;
  const pct = goalMl && goalMl > 0 ? Math.min(100, Math.round((drunkMl / goalMl) * 100)) : 0;

  async function run(action: () => Promise<TgWaterDay>) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    // Отклик на само нажатие, до ответа сервера: подтверждаем нажатие, а не
    // запись. Об исходе говорит карточка — числом, которое меняется.
    haptic("tap");
    try {
      setWater(await action());
    } catch {
      // Молча терять глоток нельзя: человек нажал и вправе знать, что записи
      // не случилось. Строкой, а не экраном ошибки — цена промаха невелика.
      setFailed(true);
      haptic("error");
    } finally {
      setBusy(false);
    }
  }

  function addOwn() {
    const ml = Number(own);
    if (!Number.isFinite(ml) || ml < MIN_ENTRY_ML || ml > MAX_ENTRY_ML) return;
    setOwn("");
    void run(() => addWater(Math.round(ml), water.day));
  }

  return <section className="tg-card tg-water">
    <div className="tg-water-head">
      <h2>Жидкость</h2>
      <b>
        {formatMl(drunkMl)}
        {goalMl !== null && <i> / {formatMl(goalMl)}</i>}
      </b>
    </div>

    {goalMl !== null && <div className="tg-water-track">
      <div className="tg-water-fill" style={{ width: `${pct}%` }} />
    </div>}

    <div className="tg-water-adds">
      {QUICK_ADDS.map((preset) => <button
        type="button"
        key={preset.ml}
        disabled={busy}
        onClick={() => void run(() => addWater(preset.ml, water.day))}
      >
        <span>{preset.label}</span>
        <em>{preset.ml} мл</em>
      </button>)}
    </div>

    <div className="tg-water-own">
      <input
        type="number"
        inputMode="numeric"
        min={MIN_ENTRY_ML}
        max={MAX_ENTRY_ML}
        step={10}
        value={own}
        placeholder="Своё, мл"
        aria-label="Своё количество, мл"
        onChange={(event) => setOwn(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") addOwn(); }}
      />
      <button type="button" disabled={busy || own === ""} onClick={addOwn}>Добавить</button>
    </div>

    <p className="tg-water-note">{waterNote(drunkMl, goalMl, foodMl)}</p>

    {failed && <p className="tg-water-failed">Не записалось — попробуйте ещё раз.</p>}

    {canUndo && <button
      type="button"
      className="tg-water-undo"
      disabled={busy}
      onClick={() => void run(() => undoWater(water.day))}
    >
      Отменить последнюю запись
    </button>}
  </section>;
}

import { formatMl, MAX_ENTRY_ML, MIN_ENTRY_ML, QUICK_ADDS, waterNote } from "@/lib/water-log";
import type { WaterDay } from "@/lib/water-store";
import { logWater, undoWater } from "./water-actions";

/**
 * Счётчик жидкости на «Сегодня».
 *
 * Считаем жидкость, а не воду: чай, кофе и суп поят так же. Разделение
 * «вода отдельно, остальное не считается» — миф из той же семьи, что и
 * «восемь стаканов»; EFSA нормирует всю жидкость вместе с напитками.
 *
 * Полоса не краснеет при недоборе и не празднует перебор. Это тот же
 * принцип, по которому в дневнике нет красного состояния за превышение
 * калорий: недопитый стакан — не проступок.
 */
export function WaterCard({ water, day }: { water: WaterDay; day: string }) {
  const { drunkMl, goalMl, foodMl, canUndo } = water;
  // Заполнение считается от ориентира и упирается в 100%: полоса, уехавшая
  // за край, читалась бы как ошибка, а не как «выпил больше».
  const pct = goalMl && goalMl > 0 ? Math.min(100, Math.round((drunkMl / goalMl) * 100)) : 0;

  return <section className="water-card">
    <div className="water-head">
      <h2>Жидкость</h2>
      <b>
        {formatMl(drunkMl)}
        {goalMl !== null && <i> / {formatMl(goalMl)}</i>}
      </b>
    </div>

    {goalMl !== null && <div className="water-track">
      <div className="water-fill" style={{ width: `${pct}%` }} />
    </div>}

    <div className="water-adds">
      {QUICK_ADDS.map((preset) => <form action={logWater} key={preset.ml}>
        <input type="hidden" name="day" value={day} />
        <input type="hidden" name="ml" value={preset.ml} />
        <button type="submit">
          <span>{preset.label}</span>
          <em>{preset.ml} мл</em>
        </button>
      </form>)}

      {/* Своё количество — рядом с пресетами, но не одной из них: бутылки
          бывают разные, и загонять всех в три кнопки незачем. */}
      <form action={logWater} className="water-own">
        <input type="hidden" name="day" value={day} />
        <input
          type="number"
          name="ml"
          min={MIN_ENTRY_ML}
          max={MAX_ENTRY_ML}
          step={10}
          placeholder="Своё"
          aria-label="Своё количество, мл"
          required
        />
        <button type="submit">Добавить</button>
      </form>
    </div>

    <p className="water-note">{waterNote(drunkMl, goalMl, foodMl)}</p>

    {/* Отмена появляется только когда есть что отменять. Кнопка, которая
        всегда на месте и половину времени ничего не делает, — это шум. */}
    {canUndo && <form action={undoWater} className="water-undo">
      <input type="hidden" name="day" value={day} />
      <button type="submit">Отменить последнюю запись</button>
    </form>}
  </section>;
}

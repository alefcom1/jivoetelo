"use client";

// Кофеин. Западные калькуляторы отвечают на вопрос «сколько можно», и это
// наименее полезный из возможных ответов: почти все укладываются в 400 мг.
// Практический вопрос другой — во сколько последняя чашка перестанет
// мешать сну. Его и решаем, в обе стороны: сколько останется ко сну и во
// сколько нужно остановиться.

import { useState } from "react";
import {
  CAFFEINE_DAILY_LIMIT,
  CAFFEINE_DRINKS,
  CAFFEINE_HALF_LIFE,
  CAFFEINE_SLEEP_THRESHOLD,
  computeCaffeine,
  hoursBeforeSleep,
} from "@/lib/caffeine-alcohol";
import SourceCounter, { ResetButton } from "../source-counter";

const ZONE_TEXT: Record<"ok" | "near" | "above", string> = {
  ok: "В пределах безопасной дозы",
  near: "Близко к верхней границе",
  above: "Выше безопасной дозы EFSA",
};

/** Часы, на которые рисуем кривую выведения. */
const CURVE_HOURS = [0, 2, 4, 6, 8, 10, 12];

export default function CaffeineForm() {
  const [selected, setSelected] = useState<Record<string, number>>({ "Американо": 2 });
  const [lastDrinkHour, setLastDrinkHour] = useState(15);
  const [sleepHour, setSleepHour] = useState(23);

  const result = computeCaffeine(selected);
  const picked = Object.values(selected).some((count) => count > 0);
  const hoursToSleep = Math.max(0, sleepHour - lastDrinkHour);
  const atSleep = result.remainingAfter(hoursToSleep);
  const stopBefore = hoursBeforeSleep(result.totalMg);
  const stopAt = ((sleepHour - stopBefore) % 24 + 24) % 24;
  const peak = Math.max(1, result.totalMg);

  return <div className="raschet-form" role="group" aria-label="Расчёт кофеина">
    <SourceCounter
      items={CAFFEINE_DRINKS.map((drink) => ({ name: drink.name, portion: drink.portion, note: `${drink.mg} мг` }))}
      values={selected}
      onChange={setSelected}
      legend="Что вы пьёте за день"
      hint="Содержание кофеина в кофе сильно зависит от сорта, помола и способа заваривания — числа типовые, разброс может доходить до полутора раз."
      max={10}
    />

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">{result.totalMg} мг <span>кофеина за день</span></p>
        <div className="limit-bar" aria-hidden>
          <span className="limit-bar-fill" data-zone={result.zone}
            style={{ width: `${Math.min(100, Math.round((result.totalMg / (CAFFEINE_DAILY_LIMIT * 1.5)) * 100))}%` }} />
          <span className="limit-bar-mark" style={{ left: `${100 / 1.5}%` }} />
        </div>
        <p className="limit-bar-legend">
          <span>0</span><span>Предел EFSA — 400 мг</span><span>600 мг</span>
        </p>
        <div className="raschet-submetrics">
          <div><strong>{result.shareOfLimit}%</strong><span>От суточного предела</span></div>
          <div><strong>{ZONE_TEXT[result.zone]}</strong><span>Итог</span></div>
        </div>
        <p className="raschet-adjusted">
          EFSA считает безопасной для взрослого суточную дозу до 400 мг и разовую до 200 мг.
          Беременным рекомендуют вдвое меньше — до 200 мг в сутки.
        </p>
        {picked && <ResetButton onReset={() => setSelected({})} disabled={!picked} />}
      </div>
    </div>

    <fieldset>
      <legend>Во сколько остановиться, чтобы не мешало сну</legend>
      <div className="raschet-fields">
        <label>
          Последняя чашка, час
          <input type="number" inputMode="numeric" min={0} max={23} value={lastDrinkHour}
            onChange={(e) => setLastDrinkHour(clampHour(e.target.value, 15))} />
        </label>
        <label>
          Ложитесь спать, час
          <input type="number" inputMode="numeric" min={0} max={23} value={sleepHour}
            onChange={(e) => setSleepHour(clampHour(e.target.value, 23))} />
        </label>
      </div>

      <div className="caffeine-curve" aria-hidden>
        {CURVE_HOURS.map((hour) => {
          const left = result.remainingAfter(hour);
          return <div key={hour} className="caffeine-bar">
            <span style={{ height: `${Math.max(2, Math.round((left / peak) * 100))}%` }}
              data-low={left <= CAFFEINE_SLEEP_THRESHOLD ? "" : undefined} />
            <i>{hour} ч</i>
            <b>{left}</b>
          </div>;
        })}
      </div>
      <p className="raschet-hint">
        Период полувыведения кофеина у взрослого — около {CAFFEINE_HALF_LIFE} часов: каждые пять
        часов в организме остаётся половина. Столбики показывают, сколько миллиграммов остаётся
        через столько-то часов после последней порции.
      </p>

      <div className="raschet-result">
        <div className="raschet-range-card">
          <p className="raschet-range">{atSleep} мг <span>останется ко сну</span></p>
          <div className="raschet-submetrics">
            <div><strong>{hoursToSleep} ч</strong><span>От чашки до сна</span></div>
            <div><strong>{CAFFEINE_SLEEP_THRESHOLD} мг</strong><span>Порог, ниже которого не мешает</span></div>
            <div><strong>{stopBefore > 0 ? `до ${String(Math.floor(stopAt)).padStart(2, "0")}:00` : "в любое время"}</strong><span>Когда пить последнюю</span></div>
          </div>
          <p className="raschet-adjusted">
            {atSleep <= CAFFEINE_SLEEP_THRESHOLD
              ? `Ко сну останется ${atSleep} мг — меньше порога, при котором кофеин заметно мешает засыпанию. Такой режим сну не вредит.`
              : `Ко сну останется ${atSleep} мг — это больше порога в ${CAFFEINE_SLEEP_THRESHOLD} мг. Чтобы уложиться, последнюю порцию стоит выпить за ${stopBefore} часов до сна, то есть примерно до ${String(Math.floor(stopAt)).padStart(2, "0")}:00.`}
          </p>
          <div className="raschet-caveats">
            <p>
              Пять часов — среднее значение. Скорость выведения различается у людей в разы: она
              зависит от генетики, курения, приёма части лекарств и от беременности, при которой
              кофеин выводится существенно медленнее. Если вы засыпаете плохо при дозе, которую
              расчёт считает безопасной, доверяйте себе, а не формуле.
            </p>
          </div>
        </div>
      </div>
    </fieldset>
  </div>;
}

function clampHour(raw: string, fallback: number): number {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(23, Math.max(0, value));
}

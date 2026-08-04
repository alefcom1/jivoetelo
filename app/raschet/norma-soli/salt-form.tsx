"use client";

// Норма соли. Ключевая мысль страницы в том, что солонка — не главный
// источник, поэтому калькулятор не спрашивает «сколько досаливаете», а
// складывает типовые источники дня. Обычно человек уходит за норму,
// вообще не притронувшись к солонке, и увидеть это можно только так.

import { useState } from "react";
import { SALT_LIMIT_G, SALT_SOURCES, computeSalt } from "@/lib/salt-sugar";
import SourceCounter, { ResetButton } from "../source-counter";
import { ru } from "../format";

const ZONE_TEXT: Record<"ok" | "above" | "high", string> = {
  ok: "В пределах нормы ВОЗ",
  above: "Выше нормы ВОЗ",
  high: "Вдвое выше нормы и больше",
};

export default function SaltForm() {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const result = computeSalt(selected);
  const picked = Object.values(selected).some((count) => count > 0);
  const percent = Math.min(100, Math.round((result.totalG / (SALT_LIMIT_G * 3)) * 100));

  return <div className="raschet-form" role="group" aria-label="Расчёт нормы соли">
    <SourceCounter
      items={SALT_SOURCES.map((source) => ({ name: source.name, portion: source.portion, note: `${ru(source.perPortion)} г соли` }))}
      values={selected}
      onChange={setSelected}
      legend="Отметьте, что было за день"
      hint="Порции типовые. Точность здесь не главное: задача — увидеть, из чего складывается день, а не измерить его до десятых."
    />

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">{ru(result.totalG)} <span>г соли за день</span></p>

        <div className="limit-bar" aria-hidden>
          <span className="limit-bar-fill" style={{ width: `${percent}%` }}
            data-zone={result.zone} />
          <span className="limit-bar-mark" style={{ left: `${100 / 3}%` }} />
        </div>
        <p className="limit-bar-legend">
          <span>0</span><span>Норма ВОЗ — 5 г</span><span>15 г</span>
        </p>

        <div className="raschet-submetrics">
          <div><strong>{result.sodiumMg} мг</strong><span>Натрия</span></div>
          <div><strong>{ru(result.ratio, 2)}×</strong><span>От нормы ВОЗ</span></div>
          <div><strong>{ZONE_TEXT[result.zone]}</strong><span>Итог</span></div>
        </div>

        <p className="raschet-adjusted">
          {!picked
            ? "Отметьте пару позиций — и станет видно, что до нормы в 5 граммов легко добраться, ни разу не взяв солонку в руки."
            : result.zone === "ok"
              ? `До верхней границы остаётся ${ru(SALT_LIMIT_G - result.totalG)} г — примерно чайная ложка без верха на четверых.`
              : `Это ${ru(result.ratio, 2)} нормы. Столько же натрия было бы в ${Math.round(result.sodiumMg / 400)} г соли — и почти всё это пришло с готовой едой, а не из солонки.`}
        </p>

        {picked && <ResetButton onReset={() => setSelected({})} disabled={!picked} />}
      </div>
    </div>
  </div>;
}

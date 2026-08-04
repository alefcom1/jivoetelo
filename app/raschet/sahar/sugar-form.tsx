"use client";

// Добавленный сахар. Две вещи, которых обычно нет в русских калькуляторах:
// лимит считается от калорийности рациона (у человека на 1400 ккал и на
// 3000 ккал он разный), а результат переводится в чайные ложки — граммы
// сахара воображению не поддаются, ложки поддаются.

import { useState } from "react";
import { SUGAR_SOURCES, SUGAR_TEASPOON_G, computeSugar } from "@/lib/salt-sugar";
import SourceCounter, { ResetButton } from "../source-counter";
import { ru } from "../format";

const ZONE_TEXT: Record<string, string> = {
  strict: "В пределах строгой рекомендации — до 5% калорийности",
  soft: "В пределах основной рекомендации, но выше строгой",
  above: "Выше рекомендации ВОЗ",
};

export default function SugarForm() {
  const [kcal, setKcal] = useState(2000);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const result = computeSugar(selected, kcal);
  const picked = Object.values(selected).some((count) => count > 0);

  return <div className="raschet-form" role="group" aria-label="Расчёт добавленного сахара">
    <div className="raschet-fields">
      <label>
        Калорийность рациона, ккал
        <input type="number" inputMode="numeric" min={800} max={5000} step={50} value={kcal}
          onChange={(e) => setKcal(Math.min(5000, Math.max(800, Math.round(Number(e.target.value) || 2000))))} />
      </label>
    </div>
    <p className="raschet-hint">
      Лимит ВОЗ задан в процентах от калорийности, а не в граммах: у человека на 1400 ккал он
      заметно ниже, чем у человека на 3000. Свою норму даёт{" "}
      <a href="/raschet/energiya">расчёт энергии</a>; не знаете — оставьте 2000.
    </p>

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">{result.limits.softG} г <span>добавленного сахара — верхняя граница</span></p>
        <div className="raschet-submetrics">
          <div><strong>{result.limits.softTeaspoons} ч. л.</strong><span>Это в ложках</span></div>
          <div><strong>{result.limits.strictG} г</strong><span>Строгая рекомендация, 5%</span></div>
          <div><strong>{result.limits.strictTeaspoons} ч. л.</strong><span>Строгая, в ложках</span></div>
        </div>
        <p className="raschet-adjusted">
          ВОЗ рекомендует держать добавленный сахар ниже 10% суточной калорийности, а дополнительную
          пользу для здоровья связывает с уровнем ниже 5%. Сахар из целого фрукта, овощей и молока
          в этот лимит не входит.
        </p>
      </div>
    </div>

    <SourceCounter
      items={SUGAR_SOURCES.map((source) => ({
        name: source.name,
        portion: source.portion,
        note: `${source.sugarG} г · ${Math.round(source.sugarG / SUGAR_TEASPOON_G)} ч. л.`,
      }))}
      values={selected}
      onChange={setSelected}
      legend="Что было за день"
      hint="В списке и очевидные источники, и те, о которых обычно не думают: кетчуп, мюсли, сладкий творожок."
    />

    <div className="raschet-result">
      <div className="raschet-range-card">
        <p className="raschet-range">{result.grams} г <span>добавленного сахара набралось</span></p>
        <div className="sugar-spoons" aria-hidden>
          {Array.from({ length: Math.min(24, result.teaspoons) }, (_, index) => <i key={index} />)}
          {result.teaspoons > 24 && <b>+{result.teaspoons - 24}</b>}
        </div>
        <div className="raschet-submetrics">
          <div><strong>{result.teaspoons} ч. л.</strong><span>Чайных ложек</span></div>
          <div><strong>{result.kcal} ккал</strong><span>Из них энергии</span></div>
          <div><strong>{ru(result.shareOfKcal)}%</strong><span>От суточной калорийности</span></div>
        </div>
        <p className="raschet-adjusted">
          {!picked
            ? "Отметьте, что было за день. Обычно норму закрывает одна банка газировки и пара мелочей, о которых человек не вспоминает."
            : `${ZONE_TEXT[result.zone]}. ${result.zone === "above"
              ? `Чтобы уложиться, нужно убрать примерно ${Math.ceil((result.grams - result.limits.softG) / SUGAR_TEASPOON_G)} чайных ложек — это, например, одна сладкая позиция из списка.`
              : "Это тот случай, когда считать дальше не нужно, — можно просто держаться того же."}`}
        </p>
        {picked && <ResetButton onReset={() => setSelected({})} disabled={!picked} />}
      </div>
    </div>
  </div>;
}

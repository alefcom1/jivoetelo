"use client";

import { useEffect, useMemo, useState } from "react";
import { computePace, LIMIT_REASONS, PACE_OPTIONS, type PaceKey } from "@/lib/pace";
import { pluralRu } from "@/lib/plural";
import {
  ACTIVITY_LABELS,
  computeTdee,
  type Activity,
  type SexForFormula,
} from "@/lib/targets";
import EmailCapture from "../email-capture";

type FormValues = {
  sexForFormula: SexForFormula;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  targetLossKg: number;
  pace: PaceKey;
};

const DEFAULT_VALUES: FormValues = {
  sexForFormula: "female",
  birthYear: 1990,
  heightCm: 168,
  weightKg: 78,
  activity: "light",
  targetLossKg: 8,
  pace: "moderate",
};

// Те же границы, что в расчёте энергии и в онбординге: расчёт должен вести
// себя одинаково, откуда бы к нему ни пришли.
const MIN_BIRTH_YEAR = 1920;
const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 230;
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;
const MAX_LOSS_KG = 80;

function isSexForFormula(value: string): value is SexForFormula {
  return value === "female" || value === "male";
}

function isActivity(value: string): value is Activity {
  return value === "sedentary" || value === "light" || value === "moderate" || value === "high";
}

function isPace(value: string): value is PaceKey {
  return PACE_OPTIONS.some((option) => option.key === value);
}

/**
 * Те же имена параметров, что у расчёта энергии, — со страницы «сколько
 * энергии нужно» сюда ведёт ссылка с уже заполненными полями, и переспрашивать
 * рост с весом второй раз незачем.
 */
function readFromSearchParams(params: URLSearchParams, maxBirthYear: number): FormValues {
  const values: FormValues = { ...DEFAULT_VALUES };

  const sex = params.get("sex");
  if (sex !== null && isSexForFormula(sex)) values.sexForFormula = sex;

  const yearParam = params.get("year");
  if (yearParam !== null) {
    const year = Number(yearParam);
    if (Number.isInteger(year) && year >= MIN_BIRTH_YEAR && year <= maxBirthYear) values.birthYear = year;
  }

  const heightParam = params.get("height");
  if (heightParam !== null) {
    const height = Number(heightParam);
    if (Number.isFinite(height) && height >= MIN_HEIGHT_CM && height <= MAX_HEIGHT_CM) values.heightCm = height;
  }

  const weightParam = params.get("weight");
  if (weightParam !== null) {
    const weight = Number(weightParam);
    if (Number.isFinite(weight) && weight >= MIN_WEIGHT_KG && weight <= MAX_WEIGHT_KG) values.weightKg = weight;
  }

  const activity = params.get("activity");
  if (activity !== null && isActivity(activity)) values.activity = activity;

  const lossParam = params.get("loss");
  if (lossParam !== null) {
    const loss = Number(lossParam);
    if (Number.isFinite(loss) && loss > 0 && loss <= MAX_LOSS_KG) values.targetLossKg = loss;
  }

  const pace = params.get("pace");
  if (pace !== null && isPace(pace)) values.pace = pace;

  return values;
}

function pluralWeeks(count: number): string {
  return pluralRu(count, ["неделя", "недели", "недель"]);
}

/** «через 14 недель» человеку говорит меньше, чем «к ноябрю 2026». */
function finishDate(weeks: number): string {
  const date = new Date();
  date.setDate(date.getDate() + weeks * 7);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
}

function formatKg(value: number): string {
  return value.toFixed(2).replace(/0$/, "").replace(".", ",");
}

export default function PaceForm({ currentYear }: { currentYear: number }) {
  const maxBirthYear = currentYear - 14;

  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [copied, setCopied] = useState(false);
  const [clipboardAvailable, setClipboardAvailable] = useState(false);
  // Дату окончания считаем только после монтирования: на сервере «сегодня»
  // другое, и разметка разошлась бы при гидратации.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    function applyEnvironment() {
      const params = new URLSearchParams(window.location.search);
      if (params.size > 0) setValues(readFromSearchParams(params, maxBirthYear));
      setClipboardAvailable(Boolean(navigator.clipboard));
      setMounted(true);
    }
    applyEnvironment();
  }, [maxBirthYear]);

  const isValid =
    values.birthYear >= MIN_BIRTH_YEAR &&
    values.birthYear <= maxBirthYear &&
    values.heightCm >= MIN_HEIGHT_CM &&
    values.heightCm <= MAX_HEIGHT_CM &&
    values.weightKg >= MIN_WEIGHT_KG &&
    values.weightKg <= MAX_WEIGHT_KG &&
    values.targetLossKg > 0 &&
    values.targetLossKg <= MAX_LOSS_KG;

  // Пересчёт мгновенный: и расход, и темп — чистые функции, сервер не нужен.
  const result = useMemo(() => {
    if (!isValid) return null;
    const tdeeKcal = computeTdee(values, currentYear);
    return { tdeeKcal, ...computePace({ weightKg: values.weightKg, tdeeKcal, pace: values.pace, targetLossKg: values.targetLossKg }) };
  }, [isValid, values, currentYear]);

  // Несовершеннолетним расчёты на снижение веса не выдаём — то же правило,
  // что в lib/targets.ts.
  const tooYoung = currentYear - values.birthYear < 18;

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCopyLink() {
    const params = new URLSearchParams({
      sex: values.sexForFormula,
      year: String(values.birthYear),
      height: String(values.heightCm),
      weight: String(values.weightKg),
      activity: values.activity,
      loss: String(values.targetLossKg),
      pace: values.pace,
    });
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?${params.toString()}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return <div className="raschet-form">
    <fieldset>
      <legend>Пол для формулы</legend>
      <div className="radio-row">
        {(["female", "male"] as SexForFormula[]).map((sex) =>
          <label className="radio-card" key={sex}>
            <input
              type="radio"
              name="sex"
              value={sex}
              checked={values.sexForFormula === sex}
              onChange={() => updateField("sexForFormula", sex)}
            />
            <span>{sex === "female" ? "Женский" : "Мужской"}</span>
          </label>)}
      </div>
    </fieldset>

    <div className="raschet-fields">
      <label>
        Год рождения
        <input
          type="number"
          min={MIN_BIRTH_YEAR}
          max={maxBirthYear}
          value={values.birthYear}
          onChange={(event) => updateField("birthYear", Number(event.target.value))}
        />
      </label>
      <label>
        Рост, см
        <input
          type="number"
          min={MIN_HEIGHT_CM}
          max={MAX_HEIGHT_CM}
          value={values.heightCm}
          onChange={(event) => updateField("heightCm", Number(event.target.value))}
        />
      </label>
      <label>
        Вес сейчас, кг
        <input
          type="number"
          step="0.1"
          min={MIN_WEIGHT_KG}
          max={MAX_WEIGHT_KG}
          value={values.weightKg}
          onChange={(event) => updateField("weightKg", Number(event.target.value))}
        />
      </label>
      <label>
        Хочу сбросить, кг
        <input
          type="number"
          step="0.5"
          min={0.5}
          max={MAX_LOSS_KG}
          value={values.targetLossKg}
          onChange={(event) => updateField("targetLossKg", Number(event.target.value))}
        />
      </label>
    </div>

    <fieldset>
      <legend>Активность</legend>
      <div className="radio-row">
        {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((activity) =>
          <label className="radio-card" key={activity}>
            <input
              type="radio"
              name="activity"
              value={activity}
              checked={values.activity === activity}
              onChange={() => updateField("activity", activity)}
            />
            <span>{ACTIVITY_LABELS[activity]}</span>
          </label>)}
      </div>
    </fieldset>

    <fieldset>
      <legend>Темп</legend>
      <div className="pace-row">
        {PACE_OPTIONS.map((option) =>
          <label className="pace-card" key={option.key}>
            <input
              type="radio"
              name="pace"
              value={option.key}
              checked={values.pace === option.key}
              onChange={() => updateField("pace", option.key)}
            />
            <span><b>{option.label}</b><span>{option.note}</span></span>
          </label>)}
      </div>
    </fieldset>

    {!isValid &&
      <p className="raschet-hint">Проверьте значения: рост в сантиметрах, вес и цель — в килограммах.</p>}

    {tooYoung &&
      <p className="raschet-adjusted">
        До восемнадцати лет мы не выдаём расчётов на снижение веса. Питание в этом возрасте стоит обсуждать
        с врачом, а не с калькулятором.
      </p>}

    {result && !tooYoung &&
      <div className="raschet-result">
        <div className="raschet-range-card">
          <p className="raschet-range">{formatKg(result.kgPerWeek)}<span>кг в неделю</span></p>
          {result.weeksToGoal !== null &&
            <p className="raschet-hint">
              {result.weeksToGoal} {pluralWeeks(result.weeksToGoal)} до цели
              {mounted && ` — примерно ${finishDate(result.weeksToGoal)}`}
            </p>}
          <div className="raschet-submetrics">
            <div><strong>−{result.dailyDeficit} ккал</strong><span>Дефицит в день</span></div>
            <div><strong>{result.kcalTarget} ккал</strong><span>Есть в день</span></div>
            <div><strong>{Math.round(result.relativeDeficit * 100)}%</strong><span>От вашего расхода</span></div>
          </div>

          <p className={result.musclePreserved ? "pace-verdict pace-verdict-safe" : "pace-verdict"}>
            {result.musclePreserved
              ? "Дефицит в зоне, где мышцы при силовых нагрузках и достаточном белке в среднем сохраняются."
              : "Дефицит выше 500 ккал в день: часть потерянного, вероятно, придётся на мышцы. Белок и силовые нагрузки уменьшают эту долю, но не убирают её."}
          </p>

          {result.limitedBy &&
            <p className="raschet-adjusted">{LIMIT_REASONS[result.limitedBy]}</p>}
        </div>

        <div className="raschet-actions">
          <a className="black-button" href="/register">Вести дневник — бесплатно</a>
          {clipboardAvailable &&
            <button type="button" className="link-button" onClick={handleCopyLink}>
              {copied ? "Ссылка скопирована" : "Скопировать ссылку на расчёт"}
            </button>}
        </div>
        <EmailCapture source="raschet_temp" context={{ kcalTarget: result.kcalTarget }} />
      </div>}
  </div>;
}

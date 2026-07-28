"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACTIVITY_LABELS,
  computeTargets,
  GOAL_LABELS,
  type Activity,
  type Goal,
  type SexForFormula,
} from "@/lib/targets";

type FormValues = {
  goal: Goal;
  sexForFormula: SexForFormula;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
};

const DEFAULT_VALUES: FormValues = {
  goal: "maintain",
  sexForFormula: "female",
  birthYear: 1990,
  heightCm: 168,
  weightKg: 65,
  activity: "light",
};

// Те же границы, что и в онбординге приложения (app/app/onboarding) — расчёт
// должен вести себя одинаково, откуда бы к нему ни пришли.
const MIN_BIRTH_YEAR = 1920;
const MIN_HEIGHT_CM = 120;
const MAX_HEIGHT_CM = 230;
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;

function isGoal(value: string): value is Goal {
  return value === "lose" || value === "maintain" || value === "gain";
}

function isSexForFormula(value: string): value is SexForFormula {
  return value === "female" || value === "male";
}

function isActivity(value: string): value is Activity {
  return value === "sedentary" || value === "light" || value === "moderate" || value === "high";
}

// Разбираем query-строку в значения формы: параметр учитывается, только если
// он укладывается в те же границы, что и ручной ввод. Иначе тихо остаёмся на
// значении по умолчанию — без сообщений об ошибке на старте страницы.
function readFromSearchParams(params: URLSearchParams, maxBirthYear: number): FormValues {
  const values: FormValues = { ...DEFAULT_VALUES };

  const goal = params.get("goal");
  if (goal !== null && isGoal(goal)) values.goal = goal;

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

  return values;
}

export default function EnergyForm({ currentYear }: { currentYear: number }) {
  const maxBirthYear = currentYear - 14;

  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [copied, setCopied] = useState(false);
  const [clipboardAvailable, setClipboardAvailable] = useState(false);

  // Параметры из ссылки применяем после монтирования, а не через
  // useSearchParams: тот заставляет Next исключить форму из статического HTML,
  // и страница-калькулятор приезжала бы к поисковику и к пользователю пустой.
  // Доступность буфера обмена проверяем здесь же — на сервере navigator нет,
  // и проверка при рендере разошлась бы с разметкой при гидратации.
  useEffect(() => {
    function applyEnvironment() {
      const params = new URLSearchParams(window.location.search);
      if (params.size > 0) setValues(readFromSearchParams(params, maxBirthYear));
      setClipboardAvailable(Boolean(navigator.clipboard));
    }
    applyEnvironment();
  }, [maxBirthYear]);

  const isValid =
    values.birthYear >= MIN_BIRTH_YEAR &&
    values.birthYear <= maxBirthYear &&
    values.heightCm >= MIN_HEIGHT_CM &&
    values.heightCm <= MAX_HEIGHT_CM &&
    values.weightKg >= MIN_WEIGHT_KG &&
    values.weightKg <= MAX_WEIGHT_KG;

  // Пересчёт мгновенный: никакой кнопки «рассчитать» и обращения к серверу,
  // весь расчёт — это чистая функция из lib/targets.
  const targets = useMemo(() => {
    if (!isValid) return null;
    return computeTargets(
      {
        goal: values.goal,
        sexForFormula: values.sexForFormula,
        birthYear: values.birthYear,
        heightCm: values.heightCm,
        weightKg: values.weightKg,
        activity: values.activity,
      },
      currentYear,
    );
  }, [isValid, values, currentYear]);

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCopyLink() {
    const params = new URLSearchParams({
      goal: values.goal,
      sex: values.sexForFormula,
      year: String(values.birthYear),
      height: String(values.heightCm),
      weight: String(values.weightKg),
      activity: values.activity,
    });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return <form className="raschet-form" onSubmit={(event) => event.preventDefault()}>
    <fieldset>
      <legend>Цель</legend>
      <div className="radio-row">
        {(Object.keys(GOAL_LABELS) as Goal[]).map((goal) =>
          <label className="radio-card" key={goal}>
            <input
              type="radio"
              name="goal"
              value={goal}
              checked={values.goal === goal}
              onChange={() => updateField("goal", goal)}
            />
            <span>{GOAL_LABELS[goal]}</span>
          </label>)}
      </div>
    </fieldset>

    <fieldset>
      <legend>Пол для формулы</legend>
      <div className="radio-row">
        <label className="radio-card">
          <input
            type="radio"
            name="sex"
            value="female"
            checked={values.sexForFormula === "female"}
            onChange={() => updateField("sexForFormula", "female")}
          />
          <span>Женский</span>
        </label>
        <label className="radio-card">
          <input
            type="radio"
            name="sex"
            value="male"
            checked={values.sexForFormula === "male"}
            onChange={() => updateField("sexForFormula", "male")}
          />
          <span>Мужской</span>
        </label>
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
        Вес, кг
        <input
          type="number"
          step="0.1"
          min={MIN_WEIGHT_KG}
          max={MAX_WEIGHT_KG}
          value={values.weightKg}
          onChange={(event) => updateField("weightKg", Number(event.target.value))}
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

    {!isValid &&
      <p className="raschet-hint">Проверьте значение: рост указывается в сантиметрах, вес — в килограммах.</p>}

    {targets &&
      <div className="raschet-result">
        <div className="raschet-range-card">
          <p className="raschet-range">{targets.kcalMin}–{targets.kcalMax}<span>ккал в день</span></p>
          <div className="raschet-submetrics">
            <div><strong>{targets.proteinTarget} г</strong><span>Белок</span></div>
            <div><strong>{targets.fiberTarget} г</strong><span>Клетчатка</span></div>
          </div>
          {targets.adjusted &&
            <p className="raschet-adjusted">
              Мы подняли расчёт до безопасного минимума. Ниже этой границы автоматические рекомендации не выдаём.
            </p>}
        </div>
        <div className="raschet-actions">
          <a className="black-button" href="/register">Вести дневник — бесплатно</a>
          {clipboardAvailable &&
            <button type="button" className="link-button" onClick={handleCopyLink}>
              {copied ? "Ссылка скопирована" : "Скопировать ссылку на расчёт"}
            </button>}
        </div>
      </div>}
  </form>;
}

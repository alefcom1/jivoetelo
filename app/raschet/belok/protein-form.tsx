"use client";

import { useEffect, useMemo, useState } from "react";
import { proteinRange } from "@/lib/protein";
import { ACTIVITY_LABELS, type Activity } from "@/lib/targets";
import EmailCapture from "../email-capture";

type FormValues = {
  weightKg: number;
  activity: Activity;
};

const DEFAULT_VALUES: FormValues = {
  weightKg: 65,
  activity: "light",
};

// Те же границы, что и в форме энергии (app/raschet/energiya/energy-form.tsx)
// и в онбординге приложения — расчёт должен вести себя одинаково.
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;

function isActivity(value: string): value is Activity {
  return value === "sedentary" || value === "light" || value === "moderate" || value === "high";
}

// Разбираем query-строку в значения формы: параметр учитывается, только если
// он укладывается в те же границы, что и ручной ввод. Иначе тихо остаёмся на
// значении по умолчанию — без сообщений об ошибке на старте страницы.
function readFromSearchParams(params: URLSearchParams): FormValues {
  const values: FormValues = { ...DEFAULT_VALUES };

  const weightParam = params.get("weight");
  if (weightParam !== null) {
    const weight = Number(weightParam);
    if (Number.isFinite(weight) && weight >= MIN_WEIGHT_KG && weight <= MAX_WEIGHT_KG) values.weightKg = weight;
  }

  const activity = params.get("activity");
  if (activity !== null && isActivity(activity)) values.activity = activity;

  return values;
}

export default function ProteinForm() {
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
      if (params.size > 0) setValues(readFromSearchParams(params));
      setClipboardAvailable(Boolean(navigator.clipboard));
    }
    applyEnvironment();
  }, []);

  const isValid = values.weightKg >= MIN_WEIGHT_KG && values.weightKg <= MAX_WEIGHT_KG;

  // Пересчёт мгновенный: никакой кнопки «рассчитать» и обращения к серверу,
  // весь расчёт — это чистая функция из lib/protein.
  const range = useMemo(() => {
    if (!isValid) return null;
    return proteinRange(values.weightKg);
  }, [isValid, values.weightKg]);

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCopyLink() {
    const params = new URLSearchParams({
      weight: String(values.weightKg),
      activity: values.activity,
    });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const showActivityNote = values.activity === "moderate" || values.activity === "high";

  // Обёртка — div, а не form: отправлять здесь нечего, расчёт идёт прямо при
  // вводе. Ниже, внутри результата, стоит настоящая форма подписки, а
  // вложенные формы браузер не разбирает (тот же приём, что в energy-form.tsx).
  return <div className="raschet-form">
    <div className="raschet-fields">
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
      <p className="raschet-hint">Проверьте значение: вес указывается в килограммах.</p>}

    {range &&
      <div className="raschet-result">
        <div className="raschet-range-card">
          <p className="raschet-range">{range.target}<span>г белка в день</span></p>
          <p className="raschet-hint">обычно достаточно от {range.min} до {range.max} г</p>
          {showActivityNote &&
            <p className="raschet-adjusted">
              При регулярных тренировках имеет смысл держаться верхней половины диапазона.
            </p>}
        </div>
        <div className="raschet-actions">
          <a className="black-button" href="/register">Вести дневник — бесплатно</a>
          {clipboardAvailable &&
            <button type="button" className="link-button" onClick={handleCopyLink}>
              {copied ? "Ссылка скопирована" : "Скопировать ссылку на расчёт"}
            </button>}
        </div>
        <EmailCapture source="raschet_belok" context={{ proteinTarget: range.target }} />
      </div>}
  </div>;
}

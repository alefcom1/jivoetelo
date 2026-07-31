"use client";

import { Choice } from "../choice";

import { useEffect, useMemo, useState } from "react";
import { evaluateQuiz, type QuizAnswers } from "@/lib/quiz";
import EmailCapture from "../email-capture";

type FormValues = Partial<QuizAnswers>;

const DEFAULT_VALUES: FormValues = {};

const MOTIVATION_LABELS: Record<QuizAnswers["motivation"], string> = {
  health: "Здоровье",
  look: "Внешний вид",
  energy: "Энергия и самочувствие",
  unsure: "Пока не определился",
};

const RECENT_DIETING_LABELS: Record<QuizAnswers["recentDieting"], string> = {
  no: "Не садился",
  recently: "Один-два раза",
  constantly: "Почти постоянно",
};

const RELATIONSHIP_LABELS: Record<QuizAnswers["relationship"], string> = {
  calm: "Спокойно",
  tense: "Иногда напряжённо",
  hard: "Еда занимает много мыслей",
};

const SLEEP_LABELS: Record<QuizAnswers["sleep"], string> = {
  ok: "Нормально",
  poor: "Часто не высыпаюсь",
};

const LIFE_LOAD_LABELS: Record<QuizAnswers["lifeLoad"], string> = {
  calm: "Спокойный период",
  busy: "Много дел",
  overloaded: "Ощущаю перегрузку",
};

function isMotivation(value: string): value is QuizAnswers["motivation"] {
  return value === "health" || value === "look" || value === "energy" || value === "unsure";
}

function isRecentDieting(value: string): value is QuizAnswers["recentDieting"] {
  return value === "no" || value === "recently" || value === "constantly";
}

function isRelationship(value: string): value is QuizAnswers["relationship"] {
  return value === "calm" || value === "tense" || value === "hard";
}

function isSleep(value: string): value is QuizAnswers["sleep"] {
  return value === "ok" || value === "poor";
}

function isLifeLoad(value: string): value is QuizAnswers["lifeLoad"] {
  return value === "calm" || value === "busy" || value === "overloaded";
}

function isComplete(values: FormValues): values is QuizAnswers {
  return (
    values.motivation !== undefined &&
    values.recentDieting !== undefined &&
    values.relationship !== undefined &&
    values.sleep !== undefined &&
    values.lifeLoad !== undefined
  );
}

// Разбираем query-строку в значения формы: параметр учитывается, только если
// он входит в набор известных вариантов. Иначе поле остаётся неотвеченным —
// как и при обычном заходе на страницу без ссылки.
function readFromSearchParams(params: URLSearchParams): FormValues {
  const values: FormValues = { ...DEFAULT_VALUES };

  const motivation = params.get("motivation");
  if (motivation !== null && isMotivation(motivation)) values.motivation = motivation;

  const recentDieting = params.get("recentDieting");
  if (recentDieting !== null && isRecentDieting(recentDieting)) values.recentDieting = recentDieting;

  const relationship = params.get("relationship");
  if (relationship !== null && isRelationship(relationship)) values.relationship = relationship;

  const sleep = params.get("sleep");
  if (sleep !== null && isSleep(sleep)) values.sleep = sleep;

  const lifeLoad = params.get("lifeLoad");
  if (lifeLoad !== null && isLifeLoad(lifeLoad)) values.lifeLoad = lifeLoad;

  return values;
}

export default function QuizForm() {
  const [values, setValues] = useState<FormValues>(DEFAULT_VALUES);
  const [copied, setCopied] = useState(false);
  const [clipboardAvailable, setClipboardAvailable] = useState(false);

  // Параметры из ссылки применяем после монтирования, а не через
  // useSearchParams: тот заставляет Next исключить форму из статического HTML,
  // и страница-квиз приезжала бы к поисковику и к пользователю пустой.
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

  // Вердикт показывается сразу, как только отвечены все пять вопросов, — до
  // этого момента считать нечего, а показывать вывод по неполным ответам
  // означало бы додумывать за пользователя.
  const verdict = useMemo(() => {
    if (!isComplete(values)) return null;
    return evaluateQuiz(values);
  }, [values]);

  function updateField<K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCopyLink() {
    if (!isComplete(values)) return;
    const params = new URLSearchParams({
      motivation: values.motivation,
      recentDieting: values.recentDieting,
      relationship: values.relationship,
      sleep: values.sleep,
      lifeLoad: values.lifeLoad,
    });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  // Обёртка — div, а не form: отправлять здесь нечего, вердикт считается
  // прямо при ответах. Ниже, внутри вердикта, стоит настоящая форма
  // подписки, а вложенные формы браузер не разбирает (тот же приём, что в
  // energy-form.tsx).
  return <div className="raschet-form">
    <fieldset>
      <legend>Что вами движет сейчас?</legend>
      <div className="radio-row">
        {(Object.keys(MOTIVATION_LABELS) as QuizAnswers["motivation"][]).map((option) =>
          <Choice key={option} selected={values.motivation === option} onChoose={() => updateField("motivation", option)}>
            <span>{MOTIVATION_LABELS[option]}</span>
          </Choice>)}
      </div>
    </fieldset>

    <fieldset>
      <legend>Как часто вы садились на диету за последний год?</legend>
      <div className="radio-row">
        {(Object.keys(RECENT_DIETING_LABELS) as QuizAnswers["recentDieting"][]).map((option) =>
          <Choice key={option} selected={values.recentDieting === option} onChoose={() => updateField("recentDieting", option)}>
            <span>{RECENT_DIETING_LABELS[option]}</span>
          </Choice>)}
      </div>
    </fieldset>

    <fieldset>
      <legend>Как вы сейчас относитесь к еде?</legend>
      <div className="radio-row">
        {(Object.keys(RELATIONSHIP_LABELS) as QuizAnswers["relationship"][]).map((option) =>
          <Choice key={option} selected={values.relationship === option} onChoose={() => updateField("relationship", option)}>
            <span>{RELATIONSHIP_LABELS[option]}</span>
          </Choice>)}
      </div>
    </fieldset>

    <fieldset>
      <legend>Как вы спите последний месяц?</legend>
      <div className="radio-row">
        {(Object.keys(SLEEP_LABELS) as QuizAnswers["sleep"][]).map((option) =>
          <Choice key={option} selected={values.sleep === option} onChoose={() => updateField("sleep", option)}>
            <span>{SLEEP_LABELS[option]}</span>
          </Choice>)}
      </div>
    </fieldset>

    <fieldset>
      <legend>Что сейчас происходит в жизни?</legend>
      <div className="radio-row">
        {(Object.keys(LIFE_LOAD_LABELS) as QuizAnswers["lifeLoad"][]).map((option) =>
          <Choice key={option} selected={values.lifeLoad === option} onChoose={() => updateField("lifeLoad", option)}>
            <span>{LIFE_LOAD_LABELS[option]}</span>
          </Choice>)}
      </div>
    </fieldset>

    {!verdict &&
      <p className="raschet-hint">Ответьте на все пять вопросов — и здесь появится ответ.</p>}

    {verdict &&
      <div className="raschet-verdict">
        <h2 className="raschet-verdict-title">{verdict.title}</h2>
        <p className="raschet-verdict-summary">{verdict.summary}</p>
        <ul className="raschet-verdict-advice">
          {verdict.advice.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="raschet-actions">
          <a className="black-button" href="/register">Вести дневник — бесплатно</a>
          {clipboardAvailable &&
            <button type="button" className="link-button" onClick={handleCopyLink}>
              {copied ? "Ссылка скопирована" : "Скопировать ссылку на результат"}
            </button>}
        </div>
        {/* Контекста здесь нет: квиз не считает ни калорий, ни белка —
            письма серии просто обойдутся без конкретных цифр (renderLetter
            в lib/email-series.ts). */}
        <EmailCapture source="raschet_kviz" />
      </div>}
  </div>;
}

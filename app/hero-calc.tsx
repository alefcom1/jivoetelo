"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ACTIVITY_LABELS,
  explainTargets,
  type Activity,
  type SexForFormula,
} from "@/lib/targets";

/**
 * Расчёт нормы прямо в первом экране.
 *
 * Раньше главная описывала продукт словами и вела «создать план» на отдельную
 * страницу — то есть просила решение до того, как показала хоть что-то. Здесь
 * человек получает свой ответ за десять секунд, без аккаунта и без перехода.
 *
 * Это же и демонстрация главного отличия: результат — коридор, а не одна
 * цифра, и рядом написано, из чего он сложился. Рассказывать про «мы честны
 * с неопределённостью» бесполезно; показать — работает.
 *
 * Считает тот же `explainTargets`, что и приложение. Отдельной «упрощённой
 * формулы для лендинга» тут нет и быть не должно: сайт, обещающий одно число,
 * а в кабинете дающий другое, — худший вид неправды, потому что его не на чем
 * поймать до регистрации.
 */

const CURRENT_YEAR = new Date().getFullYear();
const MIN_AGE = 14;
const MAX_AGE = 100;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 230;
const MIN_WEIGHT = 30;
const MAX_WEIGHT = 300;

/** Разумная отправная точка, а не «средний человек»: цифры видны и правятся. */
const DEFAULTS = { sex: "female" as SexForFormula, age: 35, height: 168, weight: 70, activity: "light" as Activity };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function HeroCalc() {
  const [sex, setSex] = useState<SexForFormula>(DEFAULTS.sex);
  const [age, setAge] = useState(String(DEFAULTS.age));
  const [height, setHeight] = useState(String(DEFAULTS.height));
  const [weight, setWeight] = useState(String(DEFAULTS.weight));
  const [activity, setActivity] = useState<Activity>(DEFAULTS.activity);

  const result = useMemo(() => {
    const ageNum = Number(age.replace(",", "."));
    const heightNum = Number(height.replace(",", "."));
    const weightNum = Number(weight.replace(",", "."));
    // Пустое или недописанное поле — не ошибка, а промежуточное состояние
    // набора. Ругаться на него в первом экране незачем: подставляем умолчание
    // и продолжаем считать, чтобы число под пальцами не мигало «—».
    const safeAge = Number.isFinite(ageNum) ? clamp(ageNum, MIN_AGE, MAX_AGE) : DEFAULTS.age;
    const safeHeight = Number.isFinite(heightNum) ? clamp(heightNum, MIN_HEIGHT, MAX_HEIGHT) : DEFAULTS.height;
    const safeWeight = Number.isFinite(weightNum) ? clamp(weightNum, MIN_WEIGHT, MAX_WEIGHT) : DEFAULTS.weight;

    return explainTargets(
      {
        goal: "maintain",
        sexForFormula: sex,
        birthYear: CURRENT_YEAR - safeAge,
        heightCm: safeHeight,
        weightKg: safeWeight,
        activity,
      },
      CURRENT_YEAR,
    );
  }, [sex, age, height, weight, activity]);

  const { targets, steps } = result;

  return <div className="hero-calc">
    <p className="hero-calc-title">Сколько энергии нужно вам</p>

    <div className="hero-calc-row">
      <div className="hero-calc-seg" role="group" aria-label="Пол">
        {(["female", "male"] as SexForFormula[]).map((key) => <button
          key={key}
          type="button"
          className={sex === key ? "active" : ""}
          onClick={() => setSex(key)}
        >{key === "female" ? "Женщина" : "Мужчина"}</button>)}
      </div>
    </div>

    <div className="hero-calc-fields">
      <label>
        Возраст
        <input type="number" inputMode="numeric" min={MIN_AGE} max={MAX_AGE}
          value={age} onChange={(e) => setAge(e.target.value)} />
      </label>
      <label>
        Рост, см
        <input type="number" inputMode="numeric" min={MIN_HEIGHT} max={MAX_HEIGHT}
          value={height} onChange={(e) => setHeight(e.target.value)} />
      </label>
      <label>
        Вес, кг
        <input type="number" inputMode="decimal" min={MIN_WEIGHT} max={MAX_WEIGHT} step="0.1"
          value={weight} onChange={(e) => setWeight(e.target.value)} />
      </label>
    </div>

    <div className="hero-calc-seg hero-calc-seg-wrap" role="group" aria-label="Активность">
      {(Object.keys(ACTIVITY_LABELS) as Activity[]).map((key) => <button
        key={key}
        type="button"
        className={activity === key ? "active" : ""}
        onClick={() => setActivity(key)}
      >{ACTIVITY_LABELS[key]}</button>)}
    </div>

    {/* aria-live: число меняется без перезагрузки и без кнопки, и незрячий
        человек иначе не узнает, что ответ обновился. */}
    <output className="hero-calc-out" aria-live="polite">
      <b>{targets.kcalMin}–{targets.kcalMax}</b>
      <span>ккал в день на поддержание веса</span>
    </output>

    <details className="hero-calc-why">
      <summary>Почему коридор, а не одна цифра</summary>
      <ol>
        {steps.map((step, index) => <li key={index}>
          <b>{step.kcal}</b>
          <span>{step.label}</span>
        </li>)}
      </ol>
      <p>
        Формула Миффлина–Сан Жеора даёт оценку, а не измерение: у двух людей
        одного роста, веса и возраста расход отличается процентов на пятнадцать.
        Одна цифра это скрывает, коридор — нет. В дневнике он уточняется по
        вашим записям.
      </p>
    </details>

    <Link className="black-button hero-calc-cta" href="/raschet/plan">Собрать полный план <b>↗</b></Link>
  </div>;
}

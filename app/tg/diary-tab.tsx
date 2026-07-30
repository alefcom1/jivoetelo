"use client";

// Экран «Дневник»: приёмы пищи по дням, с фото и балансом БЖУ, добавление
// записи (docs/miniapp-v2.md). Добавление и правка одной позиции переиспользуют
// уже готовые экраны — CameraTab (через onOpenCamera) и MealEditor ниже —
// а не дублируют их логику разбора и редактирования порции.

import { useEffect, useState } from "react";
import { formatDayRu, localToday, shiftDay } from "@/lib/dates";
import { fetchDiaryDay, type DiaryDayResponse, type DiaryMeal } from "./diary-api";
import { IconInbox } from "./icons";
import { MealEditor } from "./meal-editor";
import { haptic } from "./telegram";

function DiaryMealRow({ meal, showCalories, onOpen }: { meal: DiaryMeal; showCalories: boolean; onOpen: () => void }) {
  return <li>
    <button className="tg-diary-meal" onClick={onOpen}>
      <span className="tg-diary-meal-thumb">
        {meal.photoKey
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`/api/photos/${meal.photoKey}`} alt="" />
          : <IconInbox />}
      </span>
      <time>{meal.time}</time>
      <span className="tg-diary-meal-body">
        <b>{meal.typeLabel}</b>
        <span>{meal.itemsPreview || "без позиций"}</span>
      </span>
      <span className="tg-diary-meal-macros">
        {showCalories && <b>{meal.totals.kcal}<i> ккал</i></b>}
        <span>Б {meal.totals.protein} · Ж {meal.totals.fat} · У {meal.totals.carbs}</span>
      </span>
    </button>
  </li>;
}

function DiarySummary({ data }: { data: DiaryDayResponse }) {
  const { totals, targets, showCalories } = data;
  return <div className="tg-card tg-diary-summary">
    {showCalories && <div><strong>{totals.kcal}</strong><span>{targets ? `из ${targets.kcalTarget} ккал` : "ккал"}</span></div>}
    <div><strong>{totals.protein}</strong><span>белок, г</span></div>
    <div><strong>{totals.fat}</strong><span>жиры, г</span></div>
    <div><strong>{totals.carbs}</strong><span>углеводы, г</span></div>
    <div><strong>{totals.fiber}</strong><span>клетчатка, г</span></div>
  </div>;
}

export function DiaryTab({ onOpenCamera }: { onOpenCamera: () => void }) {
  const [day, setDay] = useState(() => localToday());
  const [data, setData] = useState<DiaryDayResponse | null>(null);
  // Изначально true — идёт первая загрузка. В true его переводят только
  // обработчики клика (goToDay ниже), а не сам эффект: правило
  // react-hooks/set-state-in-effect запрещает синхронный setState в теле
  // эффекта — сам эффект гасит флаг обратно в false, но только из
  // `.then`/`.catch`, куда он и так кладёт результат запроса.
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMealId, setSelectedMealId] = useState<number | null>(null);

  // При переключении дня старые данные остаются на экране до ответа сервера
  // (не сбрасываем `data` в null) — иначе каждый клик по стрелке дёргал бы
  // спиннером весь экран. Флаг `cancelled` — тот же приём, что в остальных
  // экранах Mini App (например, plan-tab.tsx): вкладку можно переключить
  // быстрее, чем ответит сеть.
  useEffect(() => {
    let cancelled = false;
    fetchDiaryDay(day)
      .then((result) => { if (!cancelled) { setData(result); setError(null); setPending(false); } })
      .catch(() => { if (!cancelled) { setError("Не получилось загрузить дневник."); setPending(false); } });
    return () => { cancelled = true; };
  }, [day]);

  /** Переключает день из обработчика клика — здесь, а не в эффекте, можно
   * синхронно поднять `pending` и погасить прошлую ошибку. */
  function goToDay(next: string) {
    haptic("tap");
    setPending(true);
    setError(null);
    setDay(next);
  }

  function reload() {
    fetchDiaryDay(day)
      .then(setData)
      .catch(() => setError("Не получилось обновить дневник."));
  }

  // Правка записи — отдельный подэкран внутри «Дневника», а не отдельная
  // вкладка нижней панели: это просто раскрытие строки списка.
  if (selectedMealId !== null && data) {
    return <MealEditor
      mealId={selectedMealId}
      showCalories={data.showCalories}
      onBack={() => setSelectedMealId(null)}
      onChanged={() => { setSelectedMealId(null); reload(); }}
    />;
  }

  if (!data) {
    return <div className="tg-page">
      <header className="tg-hero"><p className="tg-kicker">Дневник</p><h1>Загрузка…</h1></header>
      {error ? <p className="tg-error">{error}</p> : <div className="tg-spinner" aria-label="Загрузка" />}
    </div>;
  }

  return <div className="tg-page">
    <header className="tg-hero">
      <p className="tg-kicker">Дневник</p>
      <div className="tg-diary-nav">
        <button className="tg-diary-nav-btn" aria-label="Предыдущий день" disabled={pending}
          onClick={() => goToDay(shiftDay(day, -1))}>‹</button>
        <h1>{formatDayRu(day)}</h1>
        <button className="tg-diary-nav-btn" aria-label="Следующий день" disabled={pending || data.isToday}
          onClick={() => goToDay(shiftDay(day, 1))}>›</button>
      </div>
      {!data.isToday && <button className="tg-link" onClick={() => goToDay(localToday())}>
        Вернуться к сегодня
      </button>}
    </header>

    {error && <p className="tg-error">{error}</p>}

    {/* Итог дня — как на «Сегодня», но компактнее: числа без колец и полос
        прогресса, здесь это контекст над списком, а не главная тема экрана. */}
    <DiarySummary data={data} />

    {!data.targets && <section className="tg-card tg-hint-card">
      <p>Настройте стартовый план в веб-версии — и здесь появятся цели по энергии и белку.</p>
      <a className="tg-link" href="/app/onboarding" target="_blank" rel="noreferrer">Настроить план →</a>
    </section>}

    <section className="tg-section">
      <h2>Приёмы пищи</h2>
      {data.meals.length === 0
        ? <div className="tg-empty">
            <IconInbox />
            {/* Честное пустое состояние: для прошлого дня не притворяемся, что
                запись здесь всё ещё можно сделать «задним числом» — новая
                запись всегда ляжет сегодняшним днём (см. хинт под кнопкой ниже). */}
            <p>{data.isToday
              ? "Пока пусто. Запишите первый приём — это займёт меньше минуты."
              : "В этот день записей нет."}</p>
            <button className="tg-button" onClick={onOpenCamera}>Добавить запись</button>
          </div>
        : <>
            <ul className="tg-diary-meals">
              {data.meals.map((meal) => <DiaryMealRow
                key={meal.id}
                meal={meal}
                showCalories={data.showCalories}
                onOpen={() => { haptic("tap"); setSelectedMealId(meal.id); }}
              />)}
            </ul>
            <button className="tg-button tg-button-block" onClick={onOpenCamera}>Добавить запись</button>
          </>}
      {!data.isToday && <p className="tg-hint">Новая запись сохранится сегодняшним днём.</p>}
    </section>
  </div>;
}

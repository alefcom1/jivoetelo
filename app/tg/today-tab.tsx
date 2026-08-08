"use client";

import { mealCategory } from "@/lib/food-category";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { withPluralRu } from "@/lib/plural";
import type { TgMeal, TgTargets, TgTotals, TodayResponse } from "./api";
import { FoodIcon, foodTint } from "../food-icon";
import { IconInbox } from "./icons";
import { ArtEmptyPlate } from "./illustrations";
import { TgPhoto } from "./photo";
import { AwardCard, type FreshAward } from "./award-card";
import { StreakCard } from "./streak-card";
import { SuggestCard } from "./suggest-card";
import { TgAccessStrip } from "./access-strip";
import { haptic } from "./telegram";
import { WaterCard } from "./water-card";
import { WeightTrend } from "./weight-trend";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

/** Кольцо прогресса: доля от середины целевого диапазона. */
function ProgressRing({ value, max, label, unit }: { value: number; max: number; label: string; unit: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return <div className="tg-ring">
    <svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${value} из ${max} ${unit}`}>
      <defs>
        {/* Градиент по дуге, а не плоская заливка: кольцо — главный объект
            экрана, и объём здесь работает на него. Координаты в userSpace,
            иначе градиент считался бы от bounding box самой дуги и на малом
            заполнении сжимался бы в одно пятно. */}
        <linearGradient id="tg-ring-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="120" y2="120">
          <stop offset="0%" stopColor="var(--brand-coral)" />
          <stop offset="100%" stopColor="hsl(38 90% 58%)" />
        </linearGradient>
      </defs>
      <circle className="tg-ring-track" cx="60" cy="60" r={radius} />
      <circle
        className="tg-ring-value"
        cx="60" cy="60" r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
      />
    </svg>
    <div className="tg-ring-center">
      <strong>{value}</strong>
      <span>из {max} {unit}</span>
      {max > 0 && <em>{Math.round((value / max) * 100)}%</em>}
    </div>
  </div>;
}

/**
 * «Осталось на сегодня» — то, ради чего человек и открывает экран посреди
 * дня. Кольцо отвечает на вопрос «сколько я уже съел», а решение принимается
 * по остатку, и раньше его приходилось вычитать в уме.
 *
 * Ноль вместо отрицательного числа: «−140 ккал осталось» читается как ошибка.
 * Перебор объясняется строкой ниже — тем же языком, что и недельный обзор
 * (`lib/review.ts`): факт, а не оценка.
 */
function Remaining({ totals, targets, showCalories }: {
  totals: TgTotals;
  targets: TgTargets;
  showCalories: boolean;
}) {
  const kcalLeft = targets.kcalTarget - totals.kcal;
  const proteinLeft = Math.max(0, Math.round(targets.proteinTarget - totals.protein));
  const fiberLeft = Math.max(0, Math.round(targets.fiberTarget - totals.fiber));

  return <section className="tg-card tg-remaining">
    <h2>Осталось на сегодня</h2>
    <div className="tg-draft-total-row">
      {showCalories && <div><strong>{Math.max(0, Math.round(kcalLeft))}</strong><span>ккал</span></div>}
      <div><strong>{proteinLeft}</strong><span>белок, г</span></div>
      <div><strong>{fiberLeft}</strong><span>клетчатка, г</span></div>
    </div>
    {showCalories && kcalLeft < 0 && <p className="tg-draft-total-note">
      Сверх плана: {Math.round(-kcalLeft)} ккал. Это информация, а не оценка — один день картину не решает.
    </p>}
  </section>;
}

type MacroKey = "energy" | "protein" | "fat" | "carbs" | "fiber";

function Bar({ label, value, target, unit, macro }: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  macro: MacroKey;
}) {
  const pct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return <div className={`tg-bar tg-bar--${macro}`}>
    <div className="tg-bar-head">
      <span>{label}</span>
      <b>{value}{target ? <i> / {target}</i> : null} {unit}</b>
    </div>
    {target ? <div className="tg-bar-track"><div className="tg-bar-fill" style={{ width: `${pct}%` }} /></div> : null}
  </div>;
}

/**
 * Миниатюра приёма пищи: настоящий снимок, если человек его сделал, иначе
 * значок категории блюда. Пустой серой плашки на этом месте больше нет —
 * ради неё и заведён набор в app/tg/food-icon.tsx.
 */
function MealThumb({ meal }: { meal: TgMeal }) {
  const category = mealCategory(meal.items);
  return <span className="tg-meal-thumb" style={foodTint(category)}>
    {meal.photoKey
      ? <TgPhoto photoKey={meal.photoKey} alt="" />
      : <FoodIcon category={category} size="md" />}
  </span>;
}

/**
 * Порядок блоков на «Сегодня»: сначала день целиком, потом что съедено, потом
 * что съесть дальше, и только в конце вес.
 *
 * Он выведен из вопросов, с которыми человек открывает экран, в порядке их
 * частоты: «как у меня сегодня» → «что я уже ел» → «что съесть сейчас» →
 * «что с весом». Тренд веса стоял первым и занимал весь первый экран, хотя
 * меняется он раз в день и на решение о ближайшей еде не влияет; подбор еды
 * стоял выше списка приёмов, хотя без списка непонятно, от чего отталкиваться.
 */
export function TodayTab({
  data,
  firstName,
  onOpenCamera,
  onOpenInbox,
  onOpenMeal,
  onWeightAdded,
  hideStreak = false,
  award = null,
  onShareAward,
  onInvite,
  onOpenAccess,
}: {
  data: TodayResponse;
  firstName: string | null;
  /** Открыть раздел «Доступ» — на вкладке профиля, ею владеет оболочка. */
  onOpenAccess: () => void;
  onOpenCamera: () => void;
  onOpenInbox: () => void;
  /** Открыть правку сохранённого приёма пищи — тем же экраном, что и «Дневник». */
  onOpenMeal: (id: number) => void;
  /** Внесён новый замер веса: тренд на этом же экране устарел, день пора перечитать. */
  onWeightAdded: () => void;
  /**
   * Сверху уже стоит подсказка первых шагов — карточка серии уступает место.
   *
   * Персонаж один и картинка одна: две его реплики подряд читаются как поток
   * сообщений от одного собеседника, а не как объяснение. Решение принимает
   * оболочка (app/tg/page.tsx) — она одна видит оба блока сразу.
   */
  hideStreak?: boolean;
  /**
   * Награда, взятая сегодня. Занимает место карточки серии — это тот же
   * персонаж и то же место на экране, только повод другой.
   */
  award?: FreshAward | null;
  onShareAward?: () => void;
  /**
   * Позвать друга. Строка стоит внизу экрана, под записями, а не наверху:
   * верх — это кольцо и числа дня, и кнопка «расскажите о нас» там читается
   * как просьба рекламировать вместо того, ради чего человек открыл экран.
   * Внизу же он оказывается, когда с днём уже закончил.
   */
  onInvite?: () => void;
}) {
  const { totals, targets, showCalories } = data;
  const kcalMid = targets?.kcalTarget ?? null;

  return <div className="tg-page">
    <header className="tg-hero">
      <p className="tg-kicker">{greeting()}{firstName ? `, ${firstName}` : ""}</p>
      <h1>{showCalories && kcalMid
        ? totals.kcal >= kcalMid ? "День набран." : "Ваш день идёт."
        : "Ваш день идёт."}</h1>
    </header>

    {/* Про доступ — сразу под приветствием и выше всего остального: человеку,
        у которого через три дня закроется разбор, это самая срочная новость
        на экране. Появляется только за неделю до конца — правило считает
        сервер, общее с веб-кабинетом (lib/access-prompt.ts). */}
    {data.access && <TgAccessStrip access={data.access} onOpenAccess={onOpenAccess} />}

    {/* Живело стоит выше кольца сознательно: серия — это повод открыть
        приложение, и повод должен быть виден до того, как человек начнёт
        разбираться в цифрах дня. Ниже кольца его увидели бы только те, кто и
        так дошёл до конца экрана. */}
    {award
      ? <AwardCard award={award} onShare={onShareAward ?? (() => {})} />
      : !hideStreak && <StreakCard streak={data.streak} />}

    {/* Калории и макросы — крупно и сразу, без раскрытия (раздел «Три отличия
        от макета» спецификации Mini App v2, пункт 1). */}
    {showCalories && kcalMid
      ? <ProgressRing value={totals.kcal} max={kcalMid} label="Энергия" unit="ккал" />
      : null}

    {targets && <Remaining totals={totals} targets={targets} showCalories={showCalories} />}

    <section className="tg-card tg-macros">
      {showCalories && !kcalMid && <Bar macro="energy" label="Энергия" value={totals.kcal} target={null} unit="ккал" />}
      <Bar macro="protein" label="Белок" value={totals.protein} target={targets?.proteinTarget ?? null} unit="г" />
      <Bar macro="fat" label="Жиры" value={totals.fat} target={targets?.fatTarget ?? null} unit="г" />
      <Bar macro="carbs" label="Углеводы" value={totals.carbs} target={targets?.carbsTarget ?? null} unit="г" />
      <Bar macro="fiber" label="Клетчатка" value={totals.fiber} target={targets?.fiberTarget ?? null} unit="г" />
    </section>

    {/* Жидкость — своей карточкой, а не шестой полосой среди макронутриентов:
        у тех общий источник (разбор еды) и общая цель из плана, а здесь и
        ориентир свой, и запись делается кнопкой. Показывается и в режиме
        «скрыть калории»: воде нечего скрывать, а человеку, убравшему числа
        еды, это единственная карточка, с которой можно что-то делать руками. */}
    <WaterCard initial={data.water} />

    {!targets && <section className="tg-card tg-hint-card">
      <p>Настройте стартовый план в веб-версии — и здесь появятся цели по энергии и белку.</p>
      <a className="tg-link" href="/app/onboarding" target="_blank" rel="noreferrer">Настроить план →</a>
    </section>}

    {/* Строка инбокса — только если снимки правда ждут; пустой инбокс на
        «Сегодня» не упоминается вовсе (раздел «Три отличия от макета»,
        пункт 2). Формулировка про «не успели подтвердить», а не «разберём
        позже»: на практике люди пропускают не разбор, а подтверждение. */}
    {data.inboxPending > 0 && <button className="tg-inbox-banner" onClick={onOpenInbox}>
      <IconInbox />
      <span>Не успели подтвердить: {withPluralRu(data.inboxPending, ["снимок", "снимка", "снимков"])}</span>
      <b>→</b>
    </button>}

    <section className="tg-section">
      <h2>Приёмы пищи</h2>
      {data.meals.length === 0
        ? <div className="tg-empty">
            <ArtEmptyPlate />
            <p>Пока пусто. Запишите первый приём — это займёт меньше минуты.</p>
            <button className="tg-button" onClick={onOpenCamera}>Снять еду</button>
          </div>
        : <>
            {/* Строка списка — кнопка: нажатие открывает правку записи, тот же
                экран, что и в «Дневнике». До этого нажатие на приём пищи не
                делало ничего, хотя строка выглядела ровно как в «Дневнике»,
                где нажатие работает. Молчащий элемент, похожий на рабочий,
                хуже отсутствующего. */}
            <ul className="tg-meals">
              {data.meals.map((meal) => <li key={meal.id}>
                <button className="tg-meal-row" onClick={() => { haptic("tap"); onOpenMeal(meal.id); }}>
                  <MealThumb meal={meal} />
                  {/* Внутри кнопки только строчные элементы: <div> здесь был бы
                      невалидной разметкой — тем же приёмом собрана строка
                      «Дневника» (.tg-diary-meal). */}
                  <span className="tg-meal-row-body">
                    <b>{meal.title} <time>{meal.time}</time></b>
                    <span>{meal.items.slice(0, 3).join(", ")}</span>
                  </span>
                  <strong>
                    {showCalories && <>{meal.kcal}<small> ккал</small></>}
                    <em>{meal.protein} г белка</em>
                  </strong>
                </button>
              </li>)}
            </ul>
            {/* Второй и последующие приёмы записывались только через нижнюю
                панель: кнопка на «Сегодня» была лишь в пустом состоянии. */}
            <button className="tg-button tg-button-block" onClick={onOpenCamera}>Добавить приём</button>
          </>}
    </section>

    {/* Порядок блоков: сначала день, потом что в нём уже есть, потом
        подсказка на остаток, и только в конце вес. Вес — итог недели, а не
        новость дня: наверху он отвечал на вопрос, которого человек в этот
        момент не задаёт. */}
    <SuggestCard showCalories={showCalories} />

    <WeightTrend weight={data.weight} onAdded={onWeightAdded} />

    {/* Позвать друга — здесь, в самом низу, и одной строкой.
        Наверху, рядом с кольцом, эта кнопка соревновалась бы с тем, ради чего
        человек открыл экран, и читалась бы как просьба. Внизу он оказывается,
        когда с днём уже закончил, — и тогда это предложение, а не помеха. */}
    {onInvite && <button className="tg-invite-row" onClick={onInvite}>
      <span>Позвать друга</span>
      <em>Дневник, где еду можно просто сфотографировать →</em>
    </button>}

    {/* Дисклеймер и документы должны быть доступны и внутри Telegram, а не
        только на сайте: для части людей Mini App — единственный вход. */}
    <footer className="tg-legal">
      <p>{NOT_MEDICAL_DISCLAIMER}</p>
      <div>
        <a href="/legal/health" target="_blank" rel="noreferrer">Границы сервиса</a>
        <a href="/legal/terms" target="_blank" rel="noreferrer">Соглашение</a>
        <a href="/legal/privacy" target="_blank" rel="noreferrer">Конфиденциальность</a>
      </div>
    </footer>
  </div>;
}

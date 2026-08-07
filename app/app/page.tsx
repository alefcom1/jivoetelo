import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { mealItems, meals, profiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatDayRu, isValidDay, localToday, MEAL_TYPE_LABELS, shiftDay } from "@/lib/dates";
import { sumTotals } from "@/lib/nutrition";
import { computeTargets, targetInputFromProfile, type Targets } from "@/lib/targets";
import { listLoggedDays } from "@/lib/meals";
import { nextHint, passedByData } from "@/lib/first-run";
import { freshest, newlyEarned } from "@/lib/awards";
import { awardCounters, grantAwards, storedAwardKeys } from "@/lib/awards-store";
import { everUsedInbox } from "@/lib/inbox";
import { mascotSpeech } from "@/lib/mascot";
import { computeStreak } from "@/lib/streak";
import { getLatestWeightKg } from "@/lib/weight";
import { AppInvite } from "../app-invite";
import { MealIcon } from "../food-icon";
import { EnergyRing, MacroBar } from "./day-visuals";
import { GoalReporter } from "./goal-reporter";
import { FirstRunHint } from "./first-run-hint";
import { AwardStrip } from "./award-strip";
import { markHints } from "./hint-actions";
import { StreakStrip } from "./streak-strip";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string; saved?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { date, saved } = await searchParams;
  const day = isValidDay(date) ? date : localToday();

  const db = getDb();
  const dayMeals = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, user.id), eq(meals.eatenOn, day)))
    .orderBy(meals.eatenTime);
  const ids = dayMeals.map((m) => m.id);
  const items = ids.length > 0 ? await db.select().from(mealItems).where(inArray(mealItems.mealId, ids)) : [];
  const itemsByMeal = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByMeal.get(item.mealId) ?? [];
    list.push(item);
    itemsByMeal.set(item.mealId, list);
  }
  const dayTotals = sumTotals(items);

  // Серия считается на сегодня, а не на просматриваемый день: листая вчера,
  // человек смотрит вчерашние записи, но серия у него одна и она про сейчас.
  const today = localToday();
  const streak = computeStreak(await listLoggedDays(user.id), today);

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  const profile = profileRows[0];
  const weightKg = profile ? await getLatestWeightKg(user.id) : null;
  let targets: Targets | null = null;
  if (profile && weightKg) {
    targets = computeTargets(targetInputFromProfile(profile, weightKg));
  }

  /*
   * Первые шаги. Состояние собирается из того, что и так посчитано выше, —
   * лишний запрос здесь только один, про бота.
   *
   * `diaryOpened` в вебе выводится из адреса: человек, открывший не сегодня,
   * уже нашёл, как листать дни. Отдельной памяти, как в Mini App, не нужно.
   */
  const firstRunState = {
    seen: user.firstRunHints ?? [],
    hasPlan: targets !== null,
    loggedDays: streak.totalDays,
    mealsToday: day === today ? dayMeals.length : 0,
    botEverUsed: await everUsedInbox(user.id),
    hasWeight: weightKg !== null,
    diaryOpened: day !== today,
    showCalories: user.showCalories,
  };
  /**
   * Награды. Считаются и записываются здесь же — иначе тот, кто пользуется
   * только веб-кабинетом, не получил бы ни одной: до этого их выдавала
   * единственная точка — «Сегодня» в Mini App.
   */
  const awardState = {
    totalDays: streak.totalDays,
    bestStreak: streak.bestStreak,
    ...(await awardCounters(user.id)),
  };
  const freshAwards = newlyEarned(awardState, await storedAwardKeys(user.id));
  if (freshAwards.length > 0) await grantAwards(user.id, freshAwards, today);
  const freshAward = freshest(freshAwards);

  const hint = nextHint(firstRunState);
  /**
   * Одна реплика Живело за раз: подсказка и полоса серии — это один и тот же
   * персонаж с той же картинкой, и рядом они читаются как два сообщения
   * подряд, а не как объяснение. Приоритет у вехи — она бывает один день и не
   * повторяется, а подсказка вернётся при следующей загрузке: пройденной она
   * становится, только когда её закрыли или по ней перешли.
   */
  const milestoneToday = !!mascotSpeech(streak).milestone;
  // Награда старше и вехи, и подсказки: рубеж берётся один раз, подсказка
  // вернётся при следующей загрузке.
  const shownHint = freshAward || milestoneToday ? null : hint;
  const alreadyPassed = new Set(firstRunState.seen);
  const freshlyPassed = passedByData(firstRunState).filter((key) => !alreadyPassed.has(key));
  if (freshlyPassed.length > 0) await markHints(freshlyPassed);

  return <main className="day">
    <GoalReporter saved={saved} loggedDays={streak.totalDays} telegramLinked={user.telegramLinked} />
    {shownHint && <FirstRunHint hint={shownHint} />}
    {freshAward && <AwardStrip award={freshAward} />}
    <div className="day-nav">
      <Link href={`/app?date=${shiftDay(day, -1)}`} aria-label="Предыдущий день">←</Link>
      <h1>{formatDayRu(day)}</h1>
      <Link href={`/app?date=${shiftDay(day, 1)}`} aria-label="Следующий день">→</Link>
    </div>

    {!targets && <section className="plan-banner">
      <p>Настройте стартовый план — и мы покажем, сколько энергии и белка стоит добирать за день.</p>
      <Link className="black-button" href="/app/onboarding">Настроить план <b>↗</b></Link>
    </section>}

    {/* Живело — только на сегодняшнем дне и только когда записи уже есть.
        Листающему прошлую неделю серия ничего не сообщает, а человеку, у
        которого записей нет вовсе, «серия: 0» на первом же экране читается
        как упрёк за то, чего он ещё не делал. */}
    {day === today && streak.totalDays > 0 && !shownHint && !freshAward && <StreakStrip streak={streak} />}

    {/* Те же пять чисел, что и раньше, — но кольцом и полосами, а не пятью
        одинаковыми прямоугольниками с рамкой. В Mini App итоги дня так
        выглядели с самого начала; веб-кабинет отставал, и это стало видно,
        как только на главную встал настоящий снимок вместо макета. */}
    {/* У человека без плана и без единой записи этот блок показывал пустое
        кольцо и четыре «0 г» на весь первый экран. Ноль — не число, а
        отсутствие числа; место дорогое, и отдавать его пустоте, пока не
        настроен план, незачем. */}
    {(targets || dayMeals.length > 0) && <section className="day-summary">
      {user.showCalories && <EnergyRing value={dayTotals.kcal} target={targets?.kcalTarget ?? null} />}
      <div className="day-bars">
        <MacroBar label="Белок" value={dayTotals.protein} target={targets?.proteinTarget ?? null} unit="г" macro="protein" />
        <MacroBar label="Клетчатка" value={dayTotals.fiber} target={targets?.fiberTarget ?? null} unit="г" macro="fiber" />
        {/* Жирам и углеводам цели не назначаем — полоса без дорожки честно
            показывает съеденное, не выдумывая «из скольки». */}
        <MacroBar label="Жиры" value={dayTotals.fat} target={null} unit="г" macro="fat" />
        <MacroBar label="Углеводы" value={dayTotals.carbs} target={null} unit="г" macro="carbs" />
      </div>
    </section>}

    {targets && <Link className="next-card" href="/app/next">
      <b>Что съесть дальше?</b>
      <span>Подберём {user.showCalories ? "вариант под остаток дня" : "вариант, который поддержит ваш день"} →</span>
    </Link>}

    {dayMeals.length === 0
      ? <>
          <section className="day-empty">
            <p>Пока пусто. Добавьте первый приём пищи — текстом или фото, это займёт меньше минуты.</p>
            <Link className="black-button" href="/app/add">Добавить еду <b>↗</b></Link>
          </section>
          {/* Только в пустом дневнике. У человека, который уже ведёт записи,
              этот блок занимал бы место каждый день и ничего не сообщал. */}
          <AppInvite
            start="web"
            qr="/qr/bot-web.svg"
            title="Удобнее — с телефона"
            lead={
              "Еду фотографируют там же, где едят. Откройте бота — записи из браузера " +
              "и из Telegram лежат в одном дневнике."
            }
          />
        </>
      : <section className="day-meals">
          {dayMeals.map((meal) => {
            const mealItemList = itemsByMeal.get(meal.id) ?? [];
            const totals = sumTotals(mealItemList);
            return <Link className="day-meal" href={`/app/meals/${meal.id}`} key={meal.id}>
              <time>{meal.eatenTime}</time>
              {/* Значок категории вместо пустоты слева: тот же набор, что и в
                  Mini App, — свои глифы с тоном категории, не эмодзи и не
                  сток. Четыре одинаковые строки без него читались таблицей. */}
              <MealIcon items={mealItemList.map((i) => i.name)} />
              <div>
                <b>{MEAL_TYPE_LABELS[meal.mealType] ?? MEAL_TYPE_LABELS.other}</b>
                <span>{mealItemList.map((i) => i.name).slice(0, 4).join(", ")}</span>
              </div>
              <strong>
                {user.showCalories && <>{totals.kcal}<small> ккал</small></>}
                <em>белок {totals.protein} г</em>
              </strong>
            </Link>;
          })}
          <Link className="black-button day-add" href="/app/add">Добавить еду <b>↗</b></Link>
        </section>}
  </main>;
}

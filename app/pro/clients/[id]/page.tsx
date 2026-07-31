import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import "../../cabinet.css";
import { localToday, shiftDay } from "@/lib/dates";
import { buildDiaryMeals } from "@/lib/diary";
import { getDaySummary, getDiaryDayRows } from "@/lib/meals";
import { buildWeekReview } from "@/lib/review";
import { listRecentWeights } from "@/lib/weight";
import { grantedScopes, SCOPE_LABELS, type AccessScope } from "@/lib/pro/access";
import { getLink, requireApprovedSpecialist, withClientScope } from "@/lib/pro/guard";
import { findClientRow } from "@/lib/pro/store";

export const metadata: Metadata = {
  title: "Клиент — Живое Тело Pro",
};

/** Последние семь дней, от старого к новому, включая сегодня. */
function lastSevenDays(): string[] {
  const today = localToday();
  return Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6));
}

function shortDayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date);
  const dayOfMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric" }).format(date);
  return `${weekday}, ${dayOfMonth}`;
}

/* ------------------------------------------------------------------ */
/*  Чтение данных клиента — каждая функция вызывается ТОЛЬКО изнутри   */
/*  колбэка withClientScope (см. рендер ниже). Ни одна из них не       */
/*  экспортируется и не вызывается откуда-либо ещё в этом файле —      */
/*  так обход периметра случайно не соберётся даже при будущей правке. */
/* ------------------------------------------------------------------ */

async function readSummary(clientUserId: number) {
  const days = lastSevenDays();
  const summaries = await Promise.all(days.map((day) => getDaySummary(clientUserId, day)));
  const dayStats = summaries
    .filter((s) => s.meals.length > 0)
    .map((s) => ({ day: s.day, kcal: s.totals.kcal, protein: s.totals.protein, fiber: s.totals.fiber }));
  // Цели берём из уже посчитанного getDaySummary (он сам находит план и вес
  // клиента для формулы) — отдельного похода за целями не нужно.
  const targets = summaries.find((s) => s.targets !== null)?.targets ?? null;
  const review = buildWeekReview({
    dayStats,
    // Тренд веса — это отдельный объём согласия ("вес"), сюда его подмешивать
    // нельзя: специалист мог не получить доступ к весу вовсе.
    weeklyTrendChangeKg: null,
    targets,
    // Показываем калории независимо от личной настройки клиента в его
    // собственном приложении: специалисту это профессиональный контекст,
    // а не то предпочтение, которое клиент выбирал для себя.
    showCalories: true,
  });
  return {
    week: summaries.map((s) => ({ day: s.day, hasEntries: s.meals.length > 0 })),
    review,
  };
}

async function readDiary(clientUserId: number) {
  const days = lastSevenDays();
  const byDay = await Promise.all(
    days.map(async (day) => {
      const rows = await getDiaryDayRows(clientUserId, day);
      return { day, meals: buildDiaryMeals(rows.meals, rows.items) };
    }),
  );
  // Свежие дни сверху: специалист чаще всего смотрит «что было недавно».
  return byDay.reverse();
}

async function readWeight(clientUserId: number) {
  const points = await listRecentWeights(clientUserId, 30);
  return [...points].reverse();
}

type ScopeResult =
  | { kind: "summary"; data: Awaited<ReturnType<typeof readSummary>> }
  | { kind: "diary"; data: Awaited<ReturnType<typeof readDiary>> }
  | { kind: "weight"; data: Awaited<ReturnType<typeof readWeight>> };

async function readForScope(scope: AccessScope, clientUserId: number): Promise<ScopeResult> {
  switch (scope) {
    case "summary":
      return { kind: "summary", data: await readSummary(clientUserId) };
    case "diary":
      return { kind: "diary", data: await readDiary(clientUserId) };
    case "weight":
      return { kind: "weight", data: await readWeight(clientUserId) };
  }
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const specialist = await requireApprovedSpecialist();
  // Причины отказа здесь уже объяснены на /pro/clients — второй раз
  // разбирать их незачем, достаточно отправить туда.
  if (!specialist) redirect("/pro/clients");

  const { id } = await params;
  const clientUserId = Number(id);
  if (!Number.isInteger(clientUserId) || clientUserId <= 0) notFound();

  // Строка клиента — источник имени и подтверждение, что пара вообще
  // существует. Сами данные (дневник, вес, итоги) из неё не берём: это
  // не её задача, для этого ниже есть withClientScope.
  const clientRow = await findClientRow(specialist.userId, clientUserId);
  if (!clientRow) notFound();

  const link = await getLink(specialist.userId, clientUserId);
  const now = new Date();
  const scopes = grantedScopes(link, now);

  const { tab } = await searchParams;
  const activeTab: AccessScope | null =
    (scopes as string[]).includes(tab ?? "") ? (tab as AccessScope) : (scopes[0] ?? null);

  // Единственный путь к данным клиента на этой странице. Что бы ни
  // отобразила вкладка, чтение идёт через withClientScope — а не через
  // readSummary/readDiary/readWeight напрямую, — поэтому проверка прав и
  // запись в журнал происходят неотвратимо, а не «пока не забыли».
  const result = activeTab ? await withClientScope(specialist.userId, clientUserId, activeTab, (cid) => readForScope(activeTab, cid)) : null;

  return (
    <main className="pro-cab-detail">
      <Link className="pro-cab-back" href="/pro/clients">← Ко всем клиентам</Link>

      <div className="pro-cab-detail-head">
        <h1>{clientRow.clientName || "Без имени"}</h1>
      </div>

      <p className="pro-cab-notice">
        <i />
        Клиент видит в своём журнале, что вы открывали эти данные — кто, когда и какой именно
        раздел. Просмотр не анонимен.
      </p>

      {scopes.length === 0 ? (
        <section className="pro-cab-closed">
          <p>Клиент пока не открыл вам ни одного раздела. Как только он это сделает у себя в приложении, здесь появятся вкладки.</p>
        </section>
      ) : (
        <>
          <nav className="pro-cab-tabs">
            {scopes.map((scope) => (
              <Link
                key={scope}
                href={`/pro/clients/${clientUserId}?tab=${scope}`}
                className={scope === activeTab ? "pro-cab-tab-active" : undefined}
              >
                {SCOPE_LABELS[scope]}
              </Link>
            ))}
          </nav>

          {result && !result.ok && (
            <section className="pro-cab-denied">
              <p>Доступ к этому разделу сейчас закрыт — возможно, клиент только что его отозвал.</p>
              <Link className="link-button" href="/pro/clients">← Ко всем клиентам</Link>
            </section>
          )}

          {result && result.ok && result.data.kind === "summary" && (
            <SummaryPanel data={result.data.data} />
          )}
          {result && result.ok && result.data.kind === "diary" && (
            <DiaryPanel days={result.data.data} />
          )}
          {result && result.ok && result.data.kind === "weight" && (
            <WeightPanel points={result.data.data} />
          )}
        </>
      )}
    </main>
  );
}

function SummaryPanel({ data }: { data: Awaited<ReturnType<typeof readSummary>> }) {
  const { review } = data;
  return (
    <section>
      <div className="pro-cab-week">
        {data.week.map((d) => (
          <div key={d.day} className={d.hasEntries ? "pro-cab-week-logged" : undefined}>
            {shortDayLabel(d.day)}
            <b>{d.hasEntries ? "есть запись" : "пусто"}</b>
          </div>
        ))}
      </div>

      <div className="pro-cab-stats">
        <div><strong>{review.daysLogged}</strong><span>дней с записями</span></div>
        {review.avgKcal !== null && <div><strong>{review.avgKcal}</strong><span>ккал в среднем</span></div>}
        {review.avgProtein !== null && <div><strong>{review.avgProtein}</strong><span>белок, г в среднем</span></div>}
        {review.avgFiber !== null && <div><strong>{review.avgFiber}</strong><span>клетчатка, г в среднем</span></div>}
      </div>

      <div className="pro-cab-review">
        {review.sections.map((section) => (
          <article key={section.title}>
            <h3>{section.title}</h3>
            <p>{section.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DiaryPanel({ days }: { days: Awaited<ReturnType<typeof readDiary>> }) {
  return (
    <section className="pro-cab-days">
      {days.map((d) => (
        <div className="pro-cab-day" key={d.day}>
          <h3>{shortDayLabel(d.day)}</h3>
          {d.meals.length === 0 ? (
            <p className="pro-cab-day-empty">Записей не было.</p>
          ) : (
            d.meals.map((meal) => (
              <div className="pro-cab-meal" key={meal.id}>
                <time>{meal.time}</time>
                <b>{meal.typeLabel}</b>
                <span>{meal.itemsPreview || "без описания"}</span>
                <em>белок {meal.totals.protein} г</em>
              </div>
            ))
          )}
        </div>
      ))}
    </section>
  );
}

function WeightPanel({ points }: { points: Awaited<ReturnType<typeof readWeight>> }) {
  if (points.length === 0) {
    return <section className="pro-cab-closed"><p>Клиент пока не записывал вес.</p></section>;
  }
  return (
    <table className="pro-cab-weight-table">
      <thead><tr><th>Дата</th><th>Вес</th></tr></thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.onDate}>
            <td>{shortDayLabel(point.onDate)}</td>
            <td>{point.weightKg} кг</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

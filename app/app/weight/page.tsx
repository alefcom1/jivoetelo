import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { weightEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatDayRu } from "@/lib/dates";
import { weeklyTrendChange, weightTrend } from "@/lib/trend";
import { WeightForm } from "./weight-form";

export default async function WeightPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const entries = await getDb()
    .select({ onDate: weightEntries.onDate, weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(eq(weightEntries.userId, user.id))
    .orderBy(asc(weightEntries.onDate));
  const trend = weightTrend(entries);
  const weekly = weeklyTrendChange(trend);
  const recent = [...trend].reverse().slice(0, 14);

  return <main className="weight">
    <h1>Вес</h1>
    <p className="addflow-hint">
      Смотрите на тренд, а не на шум: дневные колебания — это вода и еда, тренд показывает настоящую динамику.
    </p>

    <WeightForm />

    {trend.length > 0 && <section className="day-totals">
      <div><strong>{trend[trend.length - 1].trendKg}</strong><span>тренд, кг</span></div>
      <div><strong>{trend[trend.length - 1].weightKg}</strong><span>последний замер, кг</span></div>
      <div>
        <strong>{weekly === null ? "—" : `${weekly > 0 ? "+" : ""}${weekly}`}</strong>
        <span>за неделю, кг</span>
      </div>
    </section>}

    {recent.length > 0
      ? <table className="meal-items">
          <thead><tr><th>Дата</th><th>Замер</th><th>Тренд</th></tr></thead>
          <tbody>
            {recent.map((point) => <tr key={point.onDate}>
              <td>{formatDayRu(point.onDate)}</td>
              <td>{point.weightKg} кг</td>
              <td>{point.trendKg} кг</td>
            </tr>)}
          </tbody>
        </table>
      : <p className="addflow-hint">Записей пока нет. Удобнее всего взвешиваться утром — но любой ритм лучше, чем никакого.</p>}
  </main>;
}

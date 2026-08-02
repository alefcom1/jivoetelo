import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatDayRu } from "@/lib/dates";
import { applyProposedAdjustment } from "../profile-actions";
import { getReviewData } from "./data";

export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { review, targets, proposal, weekStart, weekEnd, mealStats, impact } = await getReviewData(user.id, user.showCalories);

  return <main className="review">
    <h1>Недельный обзор</h1>
    <p className="addflow-hint">{formatDayRu(weekStart)} — {formatDayRu(weekEnd)}</p>

    <section className="day-totals">
      <div><strong>{review.daysLogged}</strong><span>дней с записями</span></div>
      <div><strong>{mealStats.mealCount}</strong><span>приёмов пищи</span></div>
      {user.showCalories && review.avgKcal !== null && <div><strong>{review.avgKcal}</strong><span>ккал в среднем</span></div>}
      {review.avgProtein !== null && <div><strong>{review.avgProtein}</strong><span>белок, г в среднем</span></div>}
      {review.avgFiber !== null && <div><strong>{review.avgFiber}</strong><span>клетчатка, г в среднем</span></div>}
    </section>

    {review.sections.map((section) => <section className="review-section" key={section.title}>
      <h2>{section.title}</h2>
      <p>{section.text}</p>
    </section>)}

    {impact && <section className="review-section">
      <h2>{impact.title}</h2>
      <p>{impact.text}</p>
    </section>}

    {proposal && targets && <section className="review-proposal">
      <h2>Предложение по плану</h2>
      <p>{proposal.reason}</p>
      <p className="field-note">
        Сейчас: ~{targets.kcalTarget} ккал, вероятный диапазон {targets.kcalMin}–{targets.kcalMax}. Изменение применится только после вашего подтверждения,
        и его всегда можно откатить, изменив план в настройках.
      </p>
      <form action={applyProposedAdjustment}>
        <button className="black-button" type="submit">
          Применить {proposal.deltaKcal > 0 ? "+" : ""}{proposal.deltaKcal} ккал
        </button>
      </form>
    </section>}

    {review.daysLogged === 0 && <Link className="black-button" href="/app/add">Добавить еду <b>↗</b></Link>}
  </main>;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { formatKcalChange } from "@/lib/adaptive";
import { getCurrentUser } from "@/lib/auth";
import { formatDayRu } from "@/lib/dates";
import { listAwards } from "@/lib/awards-store";
import { getPlanData } from "@/lib/plan";
import { getReviewData } from "@/lib/review-data";
import { applyProposedAdjustment } from "../profile-actions";
import { ReportOpened } from "./report-opened";

const awardDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { review, targets, proposal, weekStart, weekEnd, mealStats, impact } = await getReviewData(user.id, user.showCalories);
  // Срез и награды берутся из тех же модулей, что и в Mini App: экраны разные,
  // содержание одно.
  const [{ season }, awards] = await Promise.all([getPlanData(user.id), listAwards(user.id)]);

  return <main className="review">
    <ReportOpened />
    <h1>Недельный обзор</h1>
    <p className="addflow-hint">{formatDayRu(weekStart)} — {formatDayRu(weekEnd)}</p>

    <section className="day-totals">
      <div><strong>{review.daysLogged}</strong><span>дней с записями</span></div>
      <div><strong>{mealStats.mealCount}</strong><span>приёмов пищи</span></div>
      {/* Дни с двумя и более записями — лучший предиктор результата, лучше
          длины серии. Стоят рядом с общим числом дней, а не в тексте ниже. */}
      <div><strong>{mealStats.daysWithTwoMeals}</strong><span>дней с двумя+</span></div>
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
          Применить {formatKcalChange(proposal.deltaKcal)} ккал
        </button>
      </form>
    </section>}

    {/* Срез месяц-к-месяцу. Ниже недели: неделя отвечает на «как сейчас»,
        срез — на «изменилось ли вообще», и второй вопрос возникает позже. */}
    {season.enough && <section className="review-season">
      <h2>Месяц к месяцу</h2>
      {/* Обёртка с собственной прокруткой: пять колонок на узком экране не
          помещаются, и без неё вбок ехала бы вся страница. Прокручивается
          таблица, документ стоит на месте. */}
      <div className="season-scroll">
      <table className="season-table">
        <thead><tr><th>Месяц</th><th>Дней</th><th>Белок</th><th>Клетчатка</th><th>Вес</th></tr></thead>
        <tbody>
          {season.months.filter((month) => month.loggedDays > 0).map((month) => (
            <tr key={month.month} className={month.comparable ? "" : "season-thin"}>
              <th scope="row">{month.label}</th>
              <td>{month.loggedDays}</td>
              <td>{month.proteinPerDay === null ? "—" : `${month.proteinPerDay} г`}</td>
              <td>{month.fiberPerDay === null ? "—" : `${month.fiberPerDay} г`}</td>
              <td>{month.weightKg === null ? "—" : `${String(month.weightKg).replace(".", ",")} кг`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {season.months.some((month) => month.loggedDays > 0 && !month.comparable) && <p className="field-note">
        Месяцы с малым числом записей показаны, но в сравнение не идут: по ним видно не то, как вы ели,
        а то, какие дни успели записать.
      </p>}
      {season.notes.length > 0 && <ul className="season-notes">
        {season.notes.map((note) => <li key={note}>{note}</li>)}
      </ul>}
    </section>}

    {/* Награды. Списком и без полоски «до следующей осталось»: наблюдение за
        собой — не задание с оценкой. */}
    {awards.length > 0 && <section className="review-awards">
      <h2>Награды</h2>
      <ul className="awards-list">
        {awards.map((award) => <li key={award.key}>
          <div><b>{award.title}</b><p>{award.note}</p></div>
          <time dateTime={award.earnedOn}>{awardDate.format(new Date(`${award.earnedOn}T12:00:00Z`))}</time>
        </li>)}
      </ul>
    </section>}

    {review.daysLogged === 0 && <Link className="black-button" href="/app/add">Добавить еду <b>↗</b></Link>}
  </main>;
}

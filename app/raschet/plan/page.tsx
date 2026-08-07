import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbsJsonLd, jsonLdScript, webApplicationJsonLd } from "@/lib/schema-org";
import { AppInvite } from "../../app-invite";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import "./plan.css";
import PlanFlow from "./plan-flow";

export const metadata: Metadata = {
  title: "Стартовый план питания: коридор, а не обещанная дата — Живое Тело",
  description:
    "Пошаговый расчёт нормы энергии, белка и веса с честным коридором значений. Если формула переоценит ваш расход, мы прямо скажем, где план остановится, — вместо обещанной даты и цифры. Всё считается в браузере, ничего не сохраняется.",
  alternates: { canonical: "/raschet/plan" },
};

const FAQ_ITEMS = [
  {
    question: "Чем стартовый коридор отличается от обычного калькулятора калорий?",
    answer:
      "Обычный калькулятор выдаёт одно число. Здесь считается коридор — интервал, внутри которого почти наверняка находится ваша настоящая потребность, — плюс ориентиры по белку и клетчатке и разумный срок. Формула у всех одна и та же, разница в честности подачи результата.",
  },
  {
    question: "Почему семь вопросов, а не три?",
    answer:
      "Три вопроса — рост, вес, возраст — дают формулу для среднего человека. Остальные уточняют то, что формула не знает: как вы двигаетесь, какая цель, с какой скоростью готовы идти. Каждый вопрос влияет на итог, лишних здесь нет.",
  },
  {
    question: "Что делать после расчёта?",
    answer:
      "Неделю просто записывать еду, ничего не меняя. Почти всегда обнаруживается пара источников калорий, о которых человек не подозревал, — и этого знания часто достаточно, чтобы дальше всё пошло само.",
  },
  {
    question: "Как часто пересчитывать план?",
    answer:
      "Раз в месяц или после изменения веса на 3–5 килограммов. В приложении это происходит само: норма подстраивается по сглаженному тренду веса и предлагает корректировку небольшими шагами.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default function PlanPage() {
  return <article className="raschet-page">
    <p className="kicker">Расчёт плана <i /></p>
    <h1>Стартовый коридор, а не обещанная цифра</h1>
    <p className="raschet-lead">
      Несколько вопросов — сначала о вашем текущем состоянии, потом о теле — а на выходе не одна цифра вроде
      «−14 кг за 98 дней», а честный коридор: сколько есть, что получится по этому плану и где он остановится,
      если формула ошиблась.
    </p>
    <p className="plan-privacy-note">
      Всё считается прямо в вашем браузере. Мы ничего не отправляем на сервер и нигде не сохраняем.
    </p>
    <p className="field-note">{NOT_MEDICAL_DISCLAIMER}</p>

    {/* Год берём здесь и передаём вниз: страница статическая, и если считать
        его на клиенте, разметка после гидратации разойдётся с HTML (тот же
        приём, что в app/raschet/energiya/page.tsx). */}
    <PlanFlow currentYear={new Date().getFullYear()} />

    {/* Блок стоит после расчёта, а не до: человеку, который ещё не увидел
        своих цифр, предлагать поставить приложение рано. */}
    <AppInvite
      start="plan"
      qr="/qr/bot-plan.svg"
      title="Дальше — в телефоне"
      lead={
        "Дневник ведут там, где едят: сфотографировали тарелку, и состав посчитан. " +
        "В Telegram ни почты, ни пароля не нужно — нажали «Начать», и всё."
      }
    />

    <section className="raschet-section">
      <h2>Что дальше</h2>
      <p>
        План — это стартовая точка, а не приговор. Дальше его уточняют ваши собственные данные:
        сервис смотрит на сглаженный тренд веса и предлагает подвинуть коридор на 150 килокалорий,
        если тренд расходится с планом. Подробно — на странице{" "}
        <Link href="/kak-schitaem">«Как мы считаем»</Link>.
      </p>
      <p>
        Отдельные части плана можно пересчитать по-своему:{" "}
        <Link href="/raschet/bzhu">БЖУ</Link>, <Link href="/raschet/belok">белок</Link>,{" "}
        <Link href="/raschet/prognoz-vesa">прогноз веса</Link> или{" "}
        <Link href="/raschet/imt">ИМТ с обхватом талии</Link>.
      </p>
      <div className="raschet-actions">
        <Link className="black-button" href="/register">Начать вести дневник <b>↗</b></Link>
        <Link className="link-button" href="/raschet">Все калькуляторы</Link>
      </div>
      {/* Про деньги — рядом с кнопкой, а не в подвале: страница приводит людей
          из поиска, и умолчать о том, что через месяц разбор станет платным,
          значит отложить неприятную новость на момент, когда человек уже
          ведёт дневник. */}
      <p className="field-note">
        Первый месяц бесплатно и целиком. Дальше платным становится обращение к модели — разбор
        по фото, по описанию и голосом; сам дневник остаётся открытым.{" "}
        <Link href="/tarify">Сколько стоит →</Link>
      </p>
    </section>

    <section className="raschet-faq">
      <h2>Частые вопросы</h2>
      {FAQ_ITEMS.map((item) => <details key={item.question}>
        <summary>{item.question}</summary>
        <p>{item.answer}</p>
      </details>)}
    </section>

    <script type="application/ld+json" dangerouslySetInnerHTML={{
      __html: jsonLdScript([
        faqJsonLd,
        webApplicationJsonLd({
          name: "Расчёт стартового плана питания",
          description: "Семь вопросов — коридор калорий, ориентиры по белку и клетчатке и разумный срок.",
          path: "/raschet/plan",
        }),
        breadcrumbsJsonLd([
          { name: "Расчёты", path: "/raschet" },
          { name: "Стартовый план", path: "/raschet/plan" },
        ]),
      ]),
    }} />
  </article>;
}

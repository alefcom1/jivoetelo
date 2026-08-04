import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbsJsonLd, jsonLdScript, webApplicationJsonLd } from "@/lib/schema-org";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import QuizForm from "./quiz-form";

export const metadata: Metadata = {
  title: "Стоит ли вам сейчас снижать вес: короткий тест — Живое Тело",
  description:
    "Пять вопросов, чтобы понять, подходящий ли сейчас момент для дефицита — или полезнее начать с другого.",
  alternates: { canonical: "/raschet/kviz" },
};

const FAQ_ITEMS = [
  {
    question: "Почему сервис может отсоветовать снижать вес?",
    answer:
      "Потому что дефицит энергии — нагрузка, и есть состояния, при которых она обходится дороже пользы: хронический недосып, высокий стресс, недавняя жёсткая диета, тревожное отношение к еде. В такие периоды разумнее сначала наладить сон и регулярность питания, а снижение веса отложить.",
  },
  {
    question: "Это медицинский тест?",
    answer:
      "Нет. Это пять вопросов о вашей текущей ситуации и честный ответ на них. Диагнозов сервис не ставит и лечения не назначает; при расстройствах пищевого поведения и хронических заболеваниях решение принимает врач.",
  },
  {
    question: "Что делать, если ответ — «сейчас не лучшее время»?",
    answer:
      "Не бросать всё, а сменить задачу. Регулярность питания, достаточный белок и сон дают заметное улучшение самочувствия и без дефицита — и заодно готовят почву, чтобы следующая попытка снижения прошла легче.",
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

export default function QuizPage() {
  return <article className="raschet-page">
    <p className="kicker">Короткий тест <i /></p>
    <h1>Стоит ли вам сейчас снижать вес</h1>
    <p className="raschet-lead">
      Ответ на этот вопрос обычно ищут в цифрах веса, хотя решают его совсем другие обстоятельства: как вы спите,
      сколько диет было до этого, что происходит в жизни и что вы сейчас чувствуете к еде. Пять вопросов ниже —
      не диагноз, а повод посмотреть на ситуацию целиком.
    </p>

    <QuizForm />

    <section className="raschet-section">
      <h2>Почему поддержание — нормальный ответ</h2>
      <p>
        Стремление всё время что-то менять и обязательно максимальными темпами утомляет и редко приводит к
        результату быстрее. Время на поддержании — не пауза в развитии: при достаточном белке и регулярном
        движении состав тела продолжает меняться, просто без цифры дефицита в расчёте.
      </p>
      <p>
        Дефицит калорий — инструмент с ограниченным сроком применения, а не постоянный режим жизни. У него есть
        момент, когда он уместен, и момент, когда его стоит отложить, — и второе так же нормально, как первое.
      </p>
    </section>

    <p className="raschet-disclaimer field-note">
      {NOT_MEDICAL_DISCLAIMER} Подробнее — <Link href="/legal/health">границы сервиса</Link>.
    </p>

    <section className="raschet-section">
      <h2>Что дальше</h2>
      <p>
        Если ответ «да, время подходящее» — посчитайте{" "}
        <Link href="/raschet/plan">стартовый коридор</Link> и выберите{" "}
        <Link href="/raschet/temp">темп, который выдержите</Link>. Если «сейчас не лучшее время» —
        начните с регулярности: <Link href="/raschet/belok">достаточного белка</Link> и записей
        в дневнике без всякого дефицита.
      </p>
      <div className="raschet-actions">
        <Link className="black-button" href="/register">Завести дневник <b>↗</b></Link>
        <Link className="link-button" href="/raschet">Все калькуляторы</Link>
      </div>
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
          name: "Стоит ли вам сейчас снижать вес",
          description: "Пять вопросов о сне, нагрузке и отношении к еде — и честный ответ, подходящее ли сейчас время.",
          path: "/raschet/kviz",
        }),
        breadcrumbsJsonLd([
          { name: "Расчёты", path: "/raschet" },
          { name: "Стоит ли снижать вес", path: "/raschet/kviz" },
        ]),
      ]),
    }} />
  </article>;
}

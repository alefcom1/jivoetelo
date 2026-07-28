import type { Metadata } from "next";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import ProteinForm from "./protein-form";

export const metadata: Metadata = {
  title: "Сколько белка нужно в день: расчёт по весу — Живое Тело",
  description:
    "Сколько белка в день нужно именно вам. Показываем диапазон, а не одну цифру, и объясняем, откуда он берётся.",
  alternates: { canonical: "/raschet/belok" },
};

// Вопросы и ответы FAQ — один источник для видимого блока и для JSON-LD ниже,
// чтобы разметка никогда не разошлась с текстом на странице.
const FAQ_ITEMS = [
  {
    question: "Считать белок по текущему весу или по желаемому?",
    answer:
      "По текущему. Расчёт по желаемому весу занижает норму именно тогда, когда белок нужнее всего — в период снижения веса. Пересчитывайте по мере того, как вес меняется.",
  },
  {
    question: "Много белка вредно для почек?",
    answer:
      "У людей со здоровыми почками потребление в пределах этого коридора не связано с вредом. При имеющемся заболевании почек норму определяет врач, а не калькулятор.",
  },
  {
    question: "Обязательно ли добирать белок добавками?",
    answer:
      "Нет. Протеиновый порошок — это удобство, а не необходимость. Обычная еда закрывает норму, если белок есть в каждом приёме пищи.",
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

export default function ProteinCalculatorPage() {
  return <article className="raschet-page">
    <p className="kicker">Расчёт белка <i /></p>
    <h1>Сколько белка нужно в день</h1>
    <p className="raschet-lead">
      Белок — единственный нутриент, недобор которого заметен почти сразу: хуже держится сытость, тяжелее
      восстановление, при снижении веса быстрее уходят мышцы. Хорошая новость в том, что точная цифра здесь не
      нужна — достаточно попадать в разумный коридор.
    </p>

    <ProteinForm />

    <section className="raschet-section">
      <h2>Откуда берётся эта цифра</h2>
      <p>
        Мы считаем 1,6 грамма на килограмм веса. Это середина того коридора, который дают исследования для
        людей, живущих обычной жизнью с умеренной активностью: примерно от 1,2 до 2,0 грамма на килограмм.
      </p>
      <p>
        Нижняя граница ближе к минимуму, при котором организму хватает материала. Верхняя — к значениям, выше
        которых пользы уже почти не прибавляется. Попадание в коридор важнее точности до грамма, поэтому мы не
        изображаем расчёт до десятых.
      </p>
    </section>

    <section className="raschet-section">
      <h2>Когда белка стоит чуть больше</h2>
      <ul>
        <li>Снижение веса. В дефиците белок помогает сохранить мышцы, а не только жир.</li>
        <li>Регулярные силовые тренировки. Материал нужен для восстановления.</li>
        <li>Возраст за 60. С возрастом организм хуже отвечает на тот же объём белка.</li>
        <li>Восстановление после болезни или операции. Здесь ориентиры лучше обсудить с врачом.</li>
      </ul>
    </section>

    <section className="raschet-faq">
      <h2>Частые вопросы</h2>
      {FAQ_ITEMS.map((item) =>
        <details key={item.question}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>)}
    </section>

    <p className="raschet-disclaimer field-note">{NOT_MEDICAL_DISCLAIMER}</p>

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
    />
  </article>;
}

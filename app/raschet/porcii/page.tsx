import type { Metadata } from "next";
import Link from "next/link";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { breadcrumbsJsonLd, jsonLdScript, webApplicationJsonLd } from "@/lib/schema-org";
import { MeasureWidget } from "./measure-widget";

export const metadata: Metadata = {
  title: "Порция без весов: сколько грамм в ложке, стакане и штуке — Живое Тело",
  description:
    "Сколько калорий в столовой ложке масла, стакане кефира или одном яйце — без кухонных весов. Бытовые меры с граммами и калориями, счётчик порции и честные границы точности такого подсчёта.",
  alternates: { canonical: "/raschet/porcii" },
};

const FAQ_ITEMS = [
  {
    question: "Насколько точен подсчёт ложками и стаканами?",
    answer:
      "Точность — порядка ±20–30%: ложка бывает с горкой и без, стакан — на 200 и на 250 миллилитров. Для дневника, который ведётся каждый день, этого достаточно: стабильная приблизительность полезнее редкой точности, а систематическую ошибку выравнивает адаптивная корректировка плана по тренду веса.",
  },
  {
    question: "Что даёт больше всего ошибки без весов?",
    answer:
      "Калорийно-плотные продукты в маленьких объёмах: масло, орехи, сыр, арахисовая паста. Ложка масла — это 88 ккал, и «щедрая» ложка легко превращается в полторы. С овощами и фруктами ошибка на глаз почти не влияет на итог дня — там мало калорий на грамм.",
  },
  {
    question: "Стоит ли покупать кухонные весы?",
    answer:
      "Если ведёте дневник всерьёз — да, это лучший инструмент за свои деньги. Но их отсутствие — не причина не записывать: запись «на глаз» с честной пометкой приблизительности намного полезнее пропущенного дня.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default function PortionsPage() {
  return <article className="raschet-page">
    <p className="kicker">
      <Link href="/raschet">Расчёты</Link> <i />
    </p>
    <h1>Порция без весов</h1>
    <p className="raschet-lead">
      Весы есть не всегда, а ложка, стакан и собственная ладонь — всегда. Выберите продукт и
      соберите порцию из бытовых мер — граммы и калории посчитаются сами.
    </p>

    <MeasureWidget />

    <section className="raschet-section">
      <h2>Как пользоваться мерами честно</h2>
      <p>
        Бытовая мера — это оценка, и разброс у неё реальный: столовая ложка «с горкой» тяжелее
        ложки «под нож» в полтора раза. Считать так можно и нужно, если помнить два правила.
        Первое: мерить одинаково — всегда одной и той же ложкой, одним стаканом, тогда ошибка
        становится систематической и перестаёт мешать сравнивать дни между собой. Второе: чем
        калорийнее продукт на грамм, тем аккуратнее мера — у масла и орехов «на глазок» стоит
        дороже всего.
      </p>
      <p>
        В приложении та же логика встроена в разбор по фото: модель оценивает порцию по снимку, а
        вы поправляете вес, если видите, что она ошиблась. Бытовые меры на этой странице — тот же
        подход без телефона в руках.
      </p>
    </section>

    <section className="raschet-section">
      <h2>Частые вопросы</h2>
      {FAQ_ITEMS.map((item) => <div key={item.question}>
        <h3>{item.question}</h3>
        <p>{item.answer}</p>
      </div>)}
      <div className="raschet-actions">
        <Link className="black-button" href="/produkty">Каталог продуктов: все меры и порции</Link>
        <Link className="link-button" href="/raschet/suhoe-varenoe">Сухая и варёная крупа</Link>
      </div>
    </section>

    <p className="raschet-disclaimer field-note">{NOT_MEDICAL_DISCLAIMER}</p>

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdScript([
          FAQ_JSON_LD,
          webApplicationJsonLd({
            name: "Порция без весов",
            description: "Считает граммы и калории порции по бытовым мерам: ложкам, стаканам, штукам.",
            path: "/raschet/porcii",
          }),
          breadcrumbsJsonLd([
            { name: "Расчёты", path: "/raschet" },
            { name: "Порция без весов", path: "/raschet/porcii" },
          ]),
        ]),
      }}
    />
  </article>;
}

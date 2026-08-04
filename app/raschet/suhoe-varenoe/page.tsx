import type { Metadata } from "next";
import Link from "next/link";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { PRODUCTS } from "@/lib/products";
import { breadcrumbsJsonLd, jsonLdScript, webApplicationJsonLd } from "@/lib/schema-org";
import { DryCookedConverter } from "./converter";

export const metadata: Metadata = {
  title: "Сухая и варёная крупа: пересчёт веса и калорий — Живое Тело",
  description:
    "100 г сухой гречки — это сколько варёной? Пересчёт веса и калорийности для гречки, риса, овсянки и макарон в обе стороны. Объясняем, почему путаница сухого с готовым — самая дорогая ошибка подсчёта: цена ей — три раза.",
  alternates: { canonical: "/raschet/suhoe-varenoe" },
};

// Один источник для видимого текста и разметки — правило всех страниц раздела.
const FAQ_ITEMS = [
  {
    question: "100 г сухой гречки — это сколько варёной?",
    answer:
      "Примерно 300–310 граммов: при варке крупа впитывает воду и тяжелеет втрое. Калорийность порции при этом не меняется — около 343 ккал, — потому что вода добавляет вес, но не энергию.",
  },
  {
    question: "Почему в таблицах у гречки 343 ккал, а в приложении 110?",
    answer:
      "Это одна и та же гречка в разных состояниях. 343 ккал — на 100 г сухой крупы, 110 — на 100 г отварной. Обе цифры верны; ошибка появляется, когда готовую кашу на весах считают по сухой цифре из таблицы — итог завышается почти втрое.",
  },
  {
    question: "Взвешивать крупу сухой или готовой?",
    answer:
      "Как удобнее — важно лишь брать калорийность того же состояния, что на весах. Сухую взвешивать точнее: коэффициент разваривания зависит от сорта и количества воды. Но на практике чаще взвешивают готовую — для этого и нужен пересчёт.",
  },
  {
    question: "Меняется ли что-то, кроме веса?",
    answer:
      "Практически нет. Белки, жиры и углеводы при варке в воде сохраняются — они просто распределяются на больший вес. Небольшая часть крахмала у остывшей крупы переходит в устойчивую форму, но на подсчёт калорий это влияет незначительно.",
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

export default function DryCookedPage() {
  const convertible = PRODUCTS.filter((product) => product.raw);

  return <article className="raschet-page">
    <p className="kicker">
      <Link href="/raschet">Расчёты</Link> <i />
    </p>
    <h1>Сухая и варёная: пересчёт веса и калорий</h1>
    <p className="raschet-lead">
      Дома на весы попадает готовая каша, а в таблицах чаще стоит сухая крупа. Перепутать — значит
      ошибиться почти втрое. Здесь пересчёт в обе стороны.
    </p>

    <DryCookedConverter />

    <section className="raschet-section">
      <h2>Откуда берётся трёхкратная ошибка</h2>
      <p>
        При варке крупа впитывает воду: из 100 граммов сухой гречки получается около 300 граммов
        готовой. Энергия при этом никуда не девается и ниоткуда не берётся — те же 343 ккал просто
        распределяются на втрое больший вес. Поэтому у сухой гречки 343 ккал на 100 г, а у отварной —
        110.
      </p>
      <p>
        Ошибка случается на стыке: человек взвешивает 200 граммов готовой каши, находит в таблице
        «гречка — 343», и в дневнике появляется 686 ккал вместо реальных 220. Это самая дорогая
        ошибка любительского подсчёта — систематическая, в одну сторону и почти в три раза.
      </p>
    </section>

    <section className="raschet-section">
      <h2>Коэффициенты разваривания</h2>
      <p>
        Точный коэффициент зависит от сорта и количества воды: рассыпчатая каша легче размазни при
        том же количестве крупы. Ниже — типичные значения, по которым считает пересчёт выше.
      </p>
      <dl className="product-nutrition">
        {convertible.map((product) => <div key={product.slug}>
          <dt>
            <Link href={`/produkty/${product.slug}`}>{product.name}</Link>
          </dt>
          <dd>×{product.raw!.ratio} · {product.raw!.kcal} → {product.kcal} ккал/100 г</dd>
        </div>)}
      </dl>
    </section>

    <section className="raschet-section">
      <h2>Частые вопросы</h2>
      {FAQ_ITEMS.map((item) => <div key={item.question}>
        <h3>{item.question}</h3>
        <p>{item.answer}</p>
      </div>)}
      <div className="raschet-actions">
        <Link className="black-button" href="/produkty">Каталог продуктов: ответ на вашу порцию</Link>
        <Link className="link-button" href="/raschet/energiya">Сколько калорий нужно вам в день</Link>
      </div>
    </section>

    <p className="raschet-disclaimer field-note">{NOT_MEDICAL_DISCLAIMER}</p>

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdScript([
          FAQ_JSON_LD,
          webApplicationJsonLd({
            name: "Пересчёт сухой крупы в варёную",
            description: "Считает вес и калорийность круп и макарон в сухом и готовом виде, в обе стороны.",
            path: "/raschet/suhoe-varenoe",
          }),
          breadcrumbsJsonLd([
            { name: "Расчёты", path: "/raschet" },
            { name: "Сухая и варёная", path: "/raschet/suhoe-varenoe" },
          ]),
        ]),
      }}
    />
  </article>;
}

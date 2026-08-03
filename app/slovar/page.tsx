import type { Metadata } from "next";
import Link from "next/link";
import { GLOSSARY } from "@/lib/glossary";
import { breadcrumbsJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/schema-org";

export const metadata: Metadata = {
  title: "Словарь: КБЖУ, TDEE, дефицит, тренд веса — Живое Тело",
  description:
    "Понятия, на которых стоит честный подсчёт питания: что такое диапазон КБЖУ, уверенность AI-разбора, тренд веса, дефицит энергии, TDEE и адаптивная цель. Без мифов и обещаний.",
  alternates: { canonical: "/slovar" },
};

export default function GlossaryHub() {
  return <article className="raschet-page">
    <p className="kicker">Словарь <i /></p>
    <h1>Понятия — простыми словами</h1>
    <p className="raschet-lead">
      Диапазон вместо точного числа, уверенность словами, тренд вместо утренней цифры — эти вещи
      встречаются у нас на каждом экране. Здесь объяснено, что они значат и почему устроены именно
      так.
    </p>

    <section className="raschet-section">
      <div className="glossary-grid">
        {GLOSSARY.map((term) => <Link key={term.slug} href={`/slovar/${term.slug}`} className="glossary-card">
          <h2>{term.title}</h2>
          <p>{term.short}</p>
          <span>Читать →</span>
        </Link>)}
      </div>
    </section>

    <section className="raschet-section">
      <h2>Откуда эти определения</h2>
      <p>
        Каждый термин здесь описывает решение, которое реально работает в продукте: числа в статьях —
        те же, что в коде приложения, и меняются вместе с ним. Полная методология — на странице{" "}
        <Link href="/kak-schitaem">«Как мы считаем»</Link>.
      </p>
    </section>

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdScript([
          breadcrumbsJsonLd([{ name: "Словарь", path: "/slovar" }]),
          itemListJsonLd({
            name: "Словарь «Живого Тела»",
            items: GLOSSARY.map((term) => ({ name: term.title, path: `/slovar/${term.slug}` })),
          }),
        ]),
      }}
    />
  </article>;
}

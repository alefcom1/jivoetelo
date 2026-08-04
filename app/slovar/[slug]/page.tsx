import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GLOSSARY, findTerm } from "@/lib/glossary";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { breadcrumbsJsonLd, definedTermJsonLd, jsonLdScript } from "@/lib/schema-org";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GLOSSARY.map((term) => ({ slug: term.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const term = findTerm((await params).slug);
  if (!term) return {};
  return {
    // Вопрос — в заголовок: так это и спрашивают у поиска. `short` обязан
    // отвечать сам по себе — он и есть description.
    title: `${term.question} — Живое Тело`,
    description: term.short,
    alternates: { canonical: `/slovar/${term.slug}` },
  };
}

export default async function GlossaryTermPage({ params }: Params) {
  const term = findTerm((await params).slug);
  if (!term) notFound();

  return <article className="raschet-page">
    <p className="kicker">
      <Link href="/slovar">Словарь</Link> <i />
    </p>
    <h1>{term.question}</h1>
    {/* Ответ — первым абзацем, до всех разделов: человек из поиска должен
        получить его без прокрутки, иначе он вернётся в выдачу за «нормальным»
        ответом — а это худший из поведенческих сигналов. */}
    <p className="raschet-lead">{term.short}</p>

    {term.sections.map((section) => <section className="raschet-section" key={section.heading}>
      <h2>{section.heading}</h2>
      {section.paragraphs.map((paragraph) => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}
    </section>)}

    <section className="raschet-section">
      <h2>Куда дальше</h2>
      <div className="raschet-actions">
        {term.related.map((link, index) => <Link
          key={link.href}
          className={index === 0 ? "black-button" : "link-button"}
          href={link.href}
        >
          {link.label}
        </Link>)}
      </div>
    </section>

    <p className="raschet-disclaimer field-note">
      {NOT_MEDICAL_DISCLAIMER} <Link href="/legal/health">Подробнее о границах сервиса →</Link>
    </p>

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdScript([
          definedTermJsonLd({ name: term.title, description: term.short, path: `/slovar/${term.slug}` }),
          breadcrumbsJsonLd([
            { name: "Словарь", path: "/slovar" },
            { name: term.title, path: `/slovar/${term.slug}` },
          ]),
        ]),
      }}
    />
  </article>;
}

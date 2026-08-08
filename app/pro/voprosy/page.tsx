import type { Metadata } from "next";
import Link from "next/link";
import { TRIAL_DAYS, priceRub, tariffByKey } from "@/lib/paid";
import { proFaq } from "@/lib/pro/faq";
import { breadcrumbsJsonLd, jsonLdScript } from "@/lib/schema-org";

export const metadata: Metadata = {
  title: "Вопросы о кабинете специалиста — Живое Тело Pro",
  description:
    "Сколько стоит кабинет нутрициолога, кто оператор данных клиента, что видно специалисту, можно ли править чужой дневник и что будет с клиентом после пробного месяца.",
  alternates: { canonical: "/pro/voprosy" },
  openGraph: { images: ["/site/pro-og.webp"] },
};

/**
 * Вопросы отдельной страницей.
 *
 * На витрине их четыре — те, что задают до того, как начали читать. Здесь
 * весь список: он длиннее, чем помещается в блок `<details>` без того, чтобы
 * страница превратилась в гармошку, и он же единственное место раздела,
 * которое имеет смысл размечать `FAQPage`.
 *
 * Ответы приходят из lib/pro/faq.ts — из того же места, откуда их берёт
 * витрина. Две копии одних формулировок разошлись бы на первой правке, и
 * разошлись бы молча: никто не читает обе страницы подряд.
 */
export default function ProFaqPage() {
  const month = tariffByKey("month")!;
  const items = proFaq(priceRub(month.priceRub), TRIAL_DAYS);

  return (
    <article className="pro-page pro-doc">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbsJsonLd([
              { name: "Главная", path: "/" },
              { name: "Для специалистов", path: "/pro" },
              { name: "Вопросы", path: "/pro/voprosy" },
            ]),
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: items.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer },
              })),
            },
          ]),
        }}
      />

      <section className="pro-hero">
        <p className="kicker">Живое Тело Pro <i /></p>
        <h1>Вопросы<br /><em>и ответы.</em></h1>
        <p className="pro-lead">
          Всё, что спрашивают специалисты до подключения и в первую неделю работы. Если вопроса
          здесь нет — напишите, мы дополним страницу.
        </p>
      </section>

      <section className="pro-doc-body">
        <div className="pro-faq-list">
          {items.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>

        <p className="pro-more">
          <Link href="/pro">← Вернуться к разделу</Link>
          {" · "}
          <Link href="/pro/dannye">Данные клиента</Link>
          {" · "}
          <Link href="/pro/kak-rabotaet">Как проходит работа</Link>
        </p>
      </section>
    </article>
  );
}

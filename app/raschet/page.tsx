import type { Metadata } from "next";
import Link from "next/link";
import { CALCULATORS, CALCULATOR_GROUPS, GROUP_NOTES, calculatorsIn, calculatorsWord } from "@/lib/calculators";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { breadcrumbsJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/schema-org";

export const metadata: Metadata = {
  title: "Калькуляторы питания: калории, БЖУ, ИМТ, порции — Живое Тело",
  description:
    "Двадцать три бесплатных калькулятора питания: норма калорий и БЖУ, витамины, ИМТ и процент жира, соль и сахар, калорийность блюда, меры и порции. Без регистрации.",
  alternates: { canonical: "/raschet" },
};

export default function RaschetHubPage() {
  return <article className="raschet-page">
    <p className="kicker">Расчёты <i /></p>
    <h1>Калькуляторы питания</h1>
    <p className="raschet-lead">
      {CALCULATORS.length} {calculatorsWord(CALCULATORS.length)}, которые работают без регистрации.
      Любой расчёт нормы — это оценка, а не измерение: мы показываем границы, внутри которых почти
      наверняка находится ваша настоящая потребность, и честно говорим, чего формула не знает.
    </p>

    {CALCULATOR_GROUPS.map((group) => <section className="raschet-section" key={group}>
      <h2>{group}</h2>
      <p>{GROUP_NOTES[group]}</p>
      <div className="raschet-index">
        {calculatorsIn(group).map((item) => <Link key={item.href} href={item.href}>
          <span><b>{item.title}</b><span>{item.summary}</span></span>
          <b>→</b>
        </Link>)}
      </div>
    </section>)}

    <section className="raschet-section">
      <h2>С чего начать</h2>
      <p>
        Если считаете впервые, полезен такой порядок. Сначала{" "}
        <Link href="/raschet/energiya">норма энергии</Link> — она задаёт точку отсчёта для всего
        остального. Потом <Link href="/raschet/bzhu">БЖУ</Link>, чтобы понять, из чего эта норма
        складывается. Если цель — снижение веса, посмотрите{" "}
        <Link href="/raschet/temp">разумный темп</Link> и{" "}
        <Link href="/raschet/prognoz-vesa">прогноз</Link>: они честно показывают, что снижение
        замедляется само и это нормально.
      </p>
      <p>
        Расчёты из группы «Кухня и порции» не спрашивают о вас ничего — они про еду, а не про тело.
        Их удобно держать под рукой во время готовки. Группа «Границы» устроена иначе, чем
        остальные: там нет нормы, которую нужно набрать, — есть предел, за которым начинается
        перебор. Соль и <Link href="/raschet/sahar">добавленный сахар</Link> чаще всего оказываются
        за ним, и почти всегда — не из-за солонки и не из-за сахарницы.
      </p>
      <div className="raschet-callout">
        <p>
          Одно общее правило для всех страниц раздела: мы не показываем одну цифру там, где честен
          диапазон. Формулы описывают среднего человека с вашими параметрами, а не вас — подробно об
          этом на странице <Link href="/kak-schitaem">«Как мы считаем»</Link>.
        </p>
      </div>
    </section>

    <p className="raschet-disclaimer field-note">
      {NOT_MEDICAL_DISCLAIMER} <Link href="/legal/health">Подробнее о границах сервиса →</Link>
    </p>

    <script type="application/ld+json" dangerouslySetInnerHTML={{
      __html: jsonLdScript([
        itemListJsonLd({
          name: "Калькуляторы питания «Живого Тела»",
          items: CALCULATORS.map((item) => ({ name: item.title, path: item.href })),
        }),
        breadcrumbsJsonLd([{ name: "Расчёты", path: "/raschet" }]),
      ]),
    }} />
  </article>;
}

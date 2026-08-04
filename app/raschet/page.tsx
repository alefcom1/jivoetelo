import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Расчёты питания — Живое Тело",
  description: "Бесплатные расчёты нормы энергии и белка. Показываем диапазон, а не одну цифру.",
  alternates: { canonical: "/raschet" },
};

// Один источник карточек для хаба: сюда же добавляются новые калькуляторы
// раздела, без правки разметки.
const CALCULATORS = [
  {
    href: "/raschet/plan",
    title: "Ваш стартовый коридор",
    summary: "Семь вопросов — и коридор калорий, белка и срока. С честной границей, где план перестаёт работать",
  },
  {
    href: "/raschet/energiya",
    title: "Сколько энергии нужно вашему телу",
    summary: "Суточная норма энергии и белка по формуле Миффлина-Сан Жеора",
  },
  {
    href: "/raschet/belok",
    title: "Сколько белка нужно в день",
    summary: "Коридор нормы по весу и когда стоит держаться его верхней половины",
  },
  {
    href: "/raschet/temp",
    title: "С какой скоростью снижать вес",
    summary: "Темп, дефицит и срок — и какую долю расхода этот темп съедает",
  },
  {
    href: "/raschet/kviz",
    title: "Стоит ли вам сейчас снижать вес",
    summary: "Пять вопросов о сне, нагрузке и отношении к еде — и честный ответ",
  },
  {
    href: "/raschet/suhoe-varenoe",
    title: "Сухая и варёная крупа",
    summary: "100 г сухой гречки — сколько это готовой? Пересчёт веса и калорий в обе стороны",
  },
  {
    href: "/raschet/porcii",
    title: "Порция без весов",
    summary: "Сколько в ложке, стакане и штуке — соберите порцию из бытовых мер",
  },
];

export default function RaschetHubPage() {
  return <article className="raschet-page">
    <p className="kicker">Расчёты <i /></p>
    <h1>Расчёты без ложной точности</h1>
    <p className="raschet-lead">
      Любой расчёт нормы — это оценка, а не измерение. Мы показываем границы, внутри которых почти наверняка
      находится ваша настоящая потребность, и честно говорим, чего формула не знает.
    </p>

    <div className="raschet-index">
      {CALCULATORS.map((item) =>
        <Link key={item.href} href={item.href}>
          <span><b>{item.title}</b><span>{item.summary}</span></span>
          <b>→</b>
        </Link>)}
    </div>
  </article>;
}

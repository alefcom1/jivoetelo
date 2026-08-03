import type { Metadata } from "next";
import Link from "next/link";
import { DISHES, DISH_CATEGORIES, portionRange, type DishCategory } from "@/lib/dishes";
import { breadcrumbsJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/schema-org";

export const metadata: Metadata = {
  title: "Калорийность блюд: диапазоны вместо выдуманной точности — Живое Тело",
  description:
    "Сколько калорий в борще, оливье, плове и другой привычной еде — честными диапазонами. Объясняем, от чего зависит цифра, вместо того чтобы называть одно число с точностью до единицы.",
  alternates: { canonical: "/skolko-kalorij" },
};

// Группируем по типу блюда: человеку, читающему про борщ, интересна солянка,
// а не блины, оказавшиеся рядом по алфавиту.
function byCategory() {
  const groups = new Map<DishCategory, typeof DISHES>();
  for (const dish of DISHES) {
    groups.set(dish.category, [...(groups.get(dish.category) ?? []), dish]);
  }
  return [...groups.entries()];
}

export default function DishesIndexPage() {
  return <article className="raschet-page">
    <p className="kicker">Калорийность блюд <i /></p>
    <h1>Сколько калорий в привычной еде</h1>
    <p className="raschet-lead">
      Любая таблица калорийности отвечает на этот вопрос одним числом с точностью до единицы. Мы отвечаем
      диапазоном — потому что борща вообще не существует: есть постный борщ у одного человека и борщ на
      говяжьей грудинке со сметаной у другого, и между ними разница втрое. Точное число это скрывает,
      диапазон показывает.
    </p>

    {byCategory().map(([category, dishes]) =>
      <section className="raschet-section" key={category}>
        <h2>{DISH_CATEGORIES[category]}</h2>
        <div className="raschet-index">
          {dishes.map((dish) => {
            const [from, to] = portionRange(dish);
            return <Link key={dish.slug} href={`/skolko-kalorij/${dish.slug}`}>
              <span><b>Сколько калорий {dish.inDish}</b><span>{from}–{to} ккал на {dish.portionLabel}</span></span>
              <b>→</b>
            </Link>;
          })}
        </div>
      </section>)}

    <section className="raschet-section">
      <h2>Откуда мы берём границы</h2>
      <p>
        Для каждого блюда мы берём распространённые варианты приготовления и считаем состав по
        ингредиентам. Границами диапазона становятся самый лёгкий и самый сытный из массовых вариантов —
        экзотические версии внутрь не входят, иначе диапазон растянулся бы так, что перестал бы что-либо
        значить.
      </p>
      <p>
        Это по-прежнему оценка, а не измерение. Ваша конкретная тарелка может выйти за границы: домашние
        рецепты бывают какими угодно. Зато вы будете знать, что именно двигает цифру, — и сможете понять,
        где внутри диапазона находитесь.
      </p>
      <div className="raschet-actions">
        <Link className="black-button" href="/raschet/energiya">Сколько калорий нужно вам в день</Link>
      </div>
    </section>

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdScript([
          breadcrumbsJsonLd([{ name: "Калорийность блюд", path: "/skolko-kalorij" }]),
          itemListJsonLd({
            name: "Калорийность блюд",
            items: DISHES.map((dish) => ({ name: dish.name, path: `/skolko-kalorij/${dish.slug}` })),
          }),
        ]),
      }}
    />
  </article>;
}

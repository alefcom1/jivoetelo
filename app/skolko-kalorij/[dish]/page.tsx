import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmailCapture from "@/app/raschet/email-capture";
import {
  DISHES,
  DISH_CATEGORIES,
  findDish,
  midpoint,
  portionRange,
  relatedDishes,
  type Dish,
} from "@/lib/dishes";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { breadcrumbsJsonLd, jsonLdScript } from "@/lib/schema-org";
import { dishSubscribeSource } from "@/lib/subscribe-source";

type Params = { params: Promise<{ dish: string }> };

// Страницы статические: блюд конечное число, данные лежат в репозитории, и
// генерировать их на каждый запрос незачем.
export function generateStaticParams() {
  return DISHES.map((dish) => ({ dish: dish.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const dish = findDish((await params).dish);
  if (!dish) return {};

  const [from, to] = portionRange(dish);
  return {
    // Формула заголовка: головная фраза, затем дифференциатор. Обещать
    // «точную калорийность» мы не можем и не хотим, а честный диапазон —
    // это ровно то, чего нет у таблиц-конкурентов. Хвост короткий, чтобы
    // дифференциатор пережил обрезку выдачи (~65 символов у Яндекса).
    title: `Сколько калорий ${dish.inDish}: честный диапазон — Живое Тело`,
    description:
      `${dish.kcal[0]}–${dish.kcal[1]} ккал на 100 г, ${from}–${to} ккал на ${dish.portionLabel}. ` +
      `Объясняем, от чего зависит цифра внутри диапазона и почему точное число ${dish.inDish} — выдумка.`,
    alternates: { canonical: `/skolko-kalorij/${dish.slug}` },
  };
}

function nutritionJsonLd(dish: Dish) {
  const [from, to] = portionRange(dish);
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `Сколько калорий ${dish.inDish}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text:
            `От ${dish.kcal[0]} до ${dish.kcal[1]} ккал на 100 г, то есть примерно ${from}–${to} ккал на ${dish.portionLabel}. ` +
            `Одного точного числа не существует: ${dish.summary.charAt(0).toLowerCase()}${dish.summary.slice(1)}`,
        },
      },
      {
        "@type": "Question",
        name: `От чего зависит калорийность ${dish.inDish}?`,
        acceptedAnswer: { "@type": "Answer", text: dish.drivers.join(" ") },
      },
      {
        "@type": "Question",
        name: "Почему вы не называете точную цифру?",
        acceptedAnswer: {
          "@type": "Answer",
          text:
            "Потому что её нет. Таблицы калорийности показывают одно число с точностью до единицы, " +
            "хотя это среднее по одной конкретной рецептуре. Диапазон честнее: он показывает, в каких " +
            "пределах находится настоящий ответ, и позволяет понять, где внутри него ваша порция.",
        },
      },
    ],
  };
}

export default async function DishPage({ params }: Params) {
  const dish = findDish((await params).dish);
  if (!dish) notFound();

  const [portionFrom, portionTo] = portionRange(dish);
  const portionMid = midpoint([portionFrom, portionTo]);
  const related = relatedDishes(dish);

  return <article className="raschet-page">
    <p className="kicker">
      <Link href="/skolko-kalorij">Калорийность блюд</Link> · {DISH_CATEGORIES[dish.category]} <i />
    </p>
    <h1>Сколько калорий {dish.inDish}</h1>

    <div className="dish-answer">
      <p className="dish-range">{portionFrom}–{portionTo}<span>ккал на порцию</span></p>
      <p className="raschet-hint">
        {dish.portionLabel}. Скорее всего около {portionMid} ккал, но это середина диапазона, а не измерение.
      </p>
      <p className="dish-per100">На 100 г: <strong>{dish.kcal[0]}–{dish.kcal[1]} ккал</strong></p>
      <div className="raschet-submetrics">
        <div><strong>{dish.protein[0]}–{dish.protein[1]} г</strong><span>Белок на 100 г</span></div>
        <div><strong>{dish.fat[0]}–{dish.fat[1]} г</strong><span>Жиры на 100 г</span></div>
        <div><strong>{dish.carbs[0]}–{dish.carbs[1]} г</strong><span>Углеводы на 100 г</span></div>
      </div>
    </div>

    {/* Страница статическая, расчёта тут нет — подписке нечего передать,
        кроме того, какое именно блюдо привело человека (для аналитики
        источников, см. lib/subscribe-source.ts). Письма серии обойдутся без
        конкретных чисел — см. renderLetter в lib/email-series.ts. */}
    <EmailCapture source={dishSubscribeSource(dish.slug)} />

    <p className="raschet-lead">{dish.summary}</p>

    <section className="raschet-section">
      <h2>Почему здесь диапазон, а не точное число</h2>
      <p>
        Русскоязычные таблицы калорийности отвечают на этот вопрос одним числом с точностью до единицы.
        Выглядит убедительно, но означает лишь одно: кто-то однажды посчитал состав по одной конкретной
        рецептуре. Вашей рецептуры среди них не было.
      </p>
      <p>
        Разница между вариантами {dish.inDish} — не проценты, а разы. Поэтому мы показываем границы, внутри
        которых находится почти любой реальный вариант, и объясняем, что двигает цифру между ними. С этим
        знанием вы сами определите, где внутри диапазона ваша порция, — и это будет точнее любой таблицы.
      </p>
    </section>

    <section className="raschet-section">
      <h2>Что двигает цифру</h2>
      <ul>
        {dish.drivers.map((driver) => <li key={driver}>{driver}</li>)}
      </ul>
    </section>

    <section className="raschet-section">
      <h2>Три варианта одного блюда</h2>
      <div className="legal-table-scroll">
        <table className="legal-table">
          <thead>
            <tr><th>Вариант</th><th>На 100 г</th><th>На порцию</th><th>Что в нём</th></tr>
          </thead>
          <tbody>
            {dish.variants.map((variant) =>
              <tr key={variant.label}>
                <td>{variant.label}</td>
                <td>{variant.kcal} ккал</td>
                <td>{Math.round((variant.kcal * dish.portionG) / 100 / 5) * 5} ккал</td>
                <td>{variant.note}</td>
              </tr>)}
          </tbody>
        </table>
      </div>
      <p className="field-note">
        Порция везде одна и та же — {dish.portionLabel}. Разница между строками объясняется только
        приготовлением.
      </p>
    </section>

    <section className="raschet-section">
      <h2>А сколько именно в вашей порции</h2>
      <p>
        Точнее любой таблицы это скажет ваша собственная тарелка. В «Живом Теле» вы фотографируете еду,
        сервис разбирает снимок и предлагает состав с уровнем уверенности — а там, где ответ заметно меняет
        результат, задаёт уточняющий вопрос: сколько было сметаны, жарили или запекали. Вы поправляете, и
        оценка становится вашей, а не усреднённой.
      </p>
      <div className="raschet-actions">
        <a className="black-button" href="/register">Разобрать свою порцию — бесплатно</a>
        <Link className="link-button" href="/raschet/energiya">Сколько калорий нужно вам в день →</Link>
      </div>
    </section>

    <section className="raschet-section">
      <h2>Смотрят ещё</h2>
      <div className="raschet-index">
        {related.map((item) => {
          const [from, to] = portionRange(item);
          return <Link key={item.slug} href={`/skolko-kalorij/${item.slug}`}>
            <span><b>Сколько калорий {item.inDish}</b><span>{from}–{to} ккал на {item.portionLabel}</span></span>
            <b>→</b>
          </Link>;
        })}
      </div>
    </section>

    <p className="raschet-disclaimer field-note">
      {NOT_MEDICAL_DISCLAIMER} <Link href="/kak-schitaem">Как мы считаем →</Link>{" "}
      <Link href="/legal/health">Границы сервиса →</Link>
    </p>

    {/* `FAQPage` оставлен сознательно: сниппетов он больше не даёт, но из
        него извлекают ответ Алиса и языковые модели. Рядом — цепочка,
        которую Яндекс поддерживает официально и которой у нас не было. */}
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdScript([
          nutritionJsonLd(dish),
          breadcrumbsJsonLd([
            { name: "Калорийность блюд", path: "/skolko-kalorij" },
            { name: DISH_CATEGORIES[dish.category], path: `/skolko-kalorij#${dish.category}` },
            { name: dish.name, path: `/skolko-kalorij/${dish.slug}` },
          ]),
        ]),
      }}
    />
  </article>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { FoodIcon } from "@/app/food-icon";
import { foodCategory, foodCategoryInfo, type FoodCategory } from "@/lib/food-category";
import { PRODUCTS, kcalFor, type Product } from "@/lib/products";
import { breadcrumbsJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/schema-org";

export const metadata: Metadata = {
  title: "Калорийность продуктов: ответ на вашу порцию, а не на 100 грамм — Живое Тело",
  description:
    "Сколько калорий в твороге, гречке, курице и другой обычной еде — на порцию, на столовую ложку, на стакан. " +
    "Пересчёт сухого в отварное и фотографии настоящих порций.",
  alternates: { canonical: "/produkty" },
};

/**
 * Группируем по категории еды — тому же справочнику, по которому раскрашены
 * значки в приложении (`lib/food-category.ts`). Свалка из семидесяти ссылок
 * не читается с телефона и не даёт поисковику структуры раздела.
 */
function byCategory(): Array<[FoodCategory, Product[]]> {
  const groups = new Map<FoodCategory, Product[]>();

  for (const product of PRODUCTS) {
    const category = foodCategory(product.name);
    const list = groups.get(category) ?? [];
    list.push(product);
    groups.set(category, list);
  }

  return [...groups.entries()].sort(([a], [b]) =>
    foodCategoryInfo(a).label.localeCompare(foodCategoryInfo(b).label, "ru"),
  );
}

export default function ProductsHub() {
  const groups = byCategory();

  return <article className="raschet-page">
    <p className="kicker">Каталог продуктов <i /></p>
    <h1>Калорийность продуктов</h1>
    <p className="raschet-lead">
      Таблицы отвечают на сто грамм. Столько никто не ест: человек стоит перед своей тарелкой,
      и вопрос у него про неё. Здесь ответ сразу на порцию — а если весов нет, то на ложку,
      стакан или штуку.
    </p>

    {groups.map(([category, products]) => <section className="raschet-section" key={category} id={category}>
      <h2>{foodCategoryInfo(category).label}</h2>
      <div className="product-grid">
        {products.map((product) => <Link key={product.slug} href={`/produkty/${product.slug}`}>
          <FoodIcon name={product.name} size="sm" />
          <b>{product.name}</b>
          <span>
            {kcalFor(product, product.portionG)} ккал
            <i> в порции {product.portionG} г</i>
          </span>
        </Link>)}
      </div>
    </section>)}

    <section className="raschet-section">
      <h2>Откуда числа</h2>
      <p>
        Состав берётся из справочных таблиц и сверяется с базой USDA FoodData Central. Крупы и
        макароны даны <b>в отварном виде</b> — дома на весы попадает готовая каша, а не сухая
        крупа, и путаница здесь стоит трёхкратной ошибки. Для них на странице есть пересчёт.
      </p>
      <p>
        Мы не переписываем чужие таблицы: каждая цифра проверяется на сходимость калорийности с
        белками, жирами и углеводами, а фотографии присылают читатели — это настоящие домашние
        порции, а не студийная съёмка.
      </p>
      <div className="raschet-actions">
        <Link className="black-button" href="/raschet/energiya">Сколько калорий нужно вам в день</Link>
        <Link className="link-button" href="/skolko-kalorij">Калорийность готовых блюд</Link>
      </div>
    </section>

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdScript([
          breadcrumbsJsonLd([{ name: "Каталог продуктов", path: "/produkty" }]),
          itemListJsonLd({
            name: "Калорийность продуктов",
            items: PRODUCTS.map((product) => ({ name: product.name, path: `/produkty/${product.slug}` })),
          }),
        ]),
      }}
    />
  </article>;
}

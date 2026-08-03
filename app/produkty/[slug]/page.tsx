import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FoodIcon } from "@/app/food-icon";
import { PHOTO_CREDIT, type CatalogPhoto } from "@/lib/catalog-photos";
import { approvedPhotosFor } from "@/lib/catalog-photos-store";
import { DISHES } from "@/lib/dishes";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { PRODUCTS, cookedFromRaw, findProduct, kcalFor, type Product } from "@/lib/products";
import { breadcrumbsJsonLd, jsonLdScript } from "@/lib/schema-org";
import { absoluteUrl } from "@/lib/site";
import { PortionPicker } from "../portion-picker";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return PRODUCTS.map((product) => ({ slug: product.slug }));
}

/**
 * Страница пересобирается раз в сутки. Снимки читателей приходят через
 * модерацию, то есть редко и не в реальном времени, — держать ради них
 * динамический рендер значило бы платить базой за каждый заход из поиска.
 */
export const revalidate = 86400;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const product = findProduct((await params).slug);
  if (!product) return {};

  const photos = await approvedPhotosFor(product.slug, 1);
  const portionKcal = kcalFor(product, product.portionG);

  // Снимок назван прямо в описании: это и есть отличие от таблиц, где либо
  // сток, либо ничего. Обещание проверяемое — если одобренных снимков нет,
  // описание о них и не говорит.
  const photoNote = photos.length > 0 ? " С фотографиями настоящих порций от читателей." : "";

  return {
    title: `Сколько калорий ${product.inProduct}: на порцию, на ложку, на 100 г — Живое Тело`,
    description:
      `${product.kcal} ккал на 100 г и ${portionKcal} ккал в порции ${product.portionG} г. ` +
      `Бытовые меры вместо весов, состав и то, что двигает цифру.${photoNote}`,
    alternates: { canonical: `/produkty/${product.slug}` },
    openGraph: photos.length > 0
      ? {
          type: "article",
          title: `Сколько калорий ${product.inProduct}`,
          images: [{ url: absoluteUrl(`/api/produkty/photo/${photos[0].id}`), alt: photos[0].caption }],
        }
      : undefined,
  };
}

/**
 * Разметка снимка.
 *
 * `caption`, `alt` и `title` несут одну и ту же строку сознательно: она
 * описывает именно то, что на снимке («Творог 5%, порция 150 г»), и врать в
 * ней нельзя — подпись проходит модерацию вместе с кадром.
 *
 * `creditText` вместо имени автора: человек соглашался на публикацию снимка
 * еды, а не на то, чтобы его имя стояло рядом с его рационом.
 */
function photoJsonLd(photo: CatalogPhoto) {
  return {
    "@type": "ImageObject",
    contentUrl: absoluteUrl(`/api/produkty/photo/${photo.id}`),
    caption: photo.caption,
    description: photo.caption,
    creditText: PHOTO_CREDIT,
    copyrightNotice: PHOTO_CREDIT,
    uploadDate: photo.createdAt.toISOString().slice(0, 10),
  };
}

function productJsonLd(product: Product, photos: CatalogPhoto[]) {
  return {
    "@context": "https://schema.org",
    "@type": "NutritionInformation",
    name: product.name,
    servingSize: `${product.portionG} г`,
    calories: `${product.kcal} ккал на 100 г`,
    proteinContent: `${product.protein} г`,
    fatContent: `${product.fat} г`,
    carbohydrateContent: `${product.carbs} г`,
    fiberContent: `${product.fiber} г`,
    ...(photos.length > 0 ? { image: photos.map(photoJsonLd) } : {}),
  };
}

export default async function ProductPage({ params }: Params) {
  const product = findProduct((await params).slug);
  if (!product) notFound();

  const photos = await approvedPhotosFor(product.slug);
  const dishes = product.dishSlugs
    .map((slug) => DISHES.find((dish) => dish.slug === slug))
    .filter((dish): dish is NonNullable<typeof dish> => Boolean(dish));

  const cooked = product.raw ? cookedFromRaw(product, 100) : null;

  return <article className="raschet-page">
    <p className="kicker">
      <Link href="/produkty">Каталог продуктов</Link> <i />
    </p>
    <h1>Сколько калорий {product.inProduct}</h1>

    {/* Ответ на порцию идёт первым, до ста грамм. Все каталоги отвечают на
        сто грамм, но никто не ест сто грамм: человек стоит перед своей
        тарелкой, и вопрос у него про неё. */}
    <PortionPicker
      name={product.name}
      kcal={product.kcal}
      protein={product.protein}
      fat={product.fat}
      carbs={product.carbs}
      fiber={product.fiber}
      portionG={product.portionG}
      household={product.household}
    />

    {photos.length > 0 && <section className="raschet-section product-photos">
      <h2>Как выглядит порция</h2>
      <p className="field-note">
        Снимки присылают читатели — это настоящие домашние порции, а не студийная съёмка.
      </p>
      <div className="product-photo-grid">
        {photos.map((photo) => <figure key={photo.id}>
          {/* Своя разметка вместо next/image: оптимизация выключена
              (images.unoptimized), и компонент дал бы только лишний слой. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/produkty/photo/${photo.id}`}
            alt={photo.caption}
            title={photo.caption}
            loading="lazy"
            decoding="async"
          />
          <figcaption>
            {photo.caption}
            <span> · {PHOTO_CREDIT}</span>
          </figcaption>
        </figure>)}
      </div>
    </section>}

    {product.raw && <section className="raschet-section">
      <h2>Сухая и отварная — разница почти втрое</h2>
      <p>
        Дома на весы попадает готовая крупа, а в таблицах чаще стоит сухая. Отсюда самая
        частая ошибка в подсчёте: цифру берут не ту и ошибаются в три раза.
      </p>
      <div className="dish-variants">
        <div>
          <b>100 г сухой</b>
          <span>{product.raw.kcal} ккал</span>
          <i>получится примерно {cooked} г готовой</i>
        </div>
        <div>
          <b>100 г отварной</b>
          <span>{product.kcal} ккал</span>
          <i>это и есть то, что на тарелке</i>
        </div>
      </div>
    </section>}

    <section className="raschet-section">
      <h2>Что двигает цифру</h2>
      <ul className="dish-drivers">
        {product.drivers.map((driver) => <li key={driver}>{driver}</li>)}
      </ul>
    </section>

    <section className="raschet-section">
      <h2>Состав на 100 г</h2>
      {/* На узком экране таблица разворачивается в список пар — горизонтальный
          скролл в числах читается хуже всего. */}
      <dl className="product-nutrition">
        <div><dt>Калорийность</dt><dd>{product.kcal} ккал</dd></div>
        <div><dt>Белки</dt><dd>{product.protein} г</dd></div>
        <div><dt>Жиры</dt><dd>{product.fat} г</dd></div>
        <div><dt>Углеводы</dt><dd>{product.carbs} г</dd></div>
        <div><dt>Клетчатка</dt><dd>{product.fiber} г</dd></div>
      </dl>
    </section>

    {dishes.length > 0 && <section className="raschet-section">
      <h2>Блюда с этим продуктом</h2>
      <div className="dish-related">
        {dishes.map((dish) => <Link key={dish.slug} href={`/skolko-kalorij/${dish.slug}`}>
          <FoodIcon name={dish.name} size="sm" />
          <b>{dish.name}</b>
          <span>{dish.kcal[0]}–{dish.kcal[1]} ккал / 100 г</span>
        </Link>)}
      </div>
    </section>}

    <section className="raschet-section">
      <h2>Посчитать свою порцию</h2>
      <p>
        Сфотографируйте тарелку — разбор посчитает вес и состав, а дневник запомнит, сколько
        вы обычно кладёте. Тогда ответ на этот вопрос станет вашим, а не усреднённым.
      </p>
      <div className="raschet-actions">
        <Link className="black-button" href="/register">Завести дневник</Link>
        <Link className="link-button" href="/raschet/energiya">Сколько калорий нужно вам в день</Link>
      </div>
    </section>

    <p className="raschet-disclaimer field-note">
      {NOT_MEDICAL_DISCLAIMER} <Link href="/legal/health">Подробнее о границах сервиса →</Link>
    </p>

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdScript([
          productJsonLd(product, photos),
          breadcrumbsJsonLd([
            { name: "Каталог продуктов", path: "/produkty" },
            { name: product.name, path: `/produkty/${product.slug}` },
          ]),
        ]),
      }}
    />
  </article>;
}

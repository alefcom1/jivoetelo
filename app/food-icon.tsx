// Значки категорий еды. Рисуем сами, в той же манере, что и навигация
// (app/tg/icons.tsx): одна толщина штриха, скруглённые концы, никаких эмодзи.
//
// Почему не эмодзи, как у конкурентов: один и тот же символ выглядит
// по-разному в iOS, Android и Telegram Desktop — набор перестаёт быть
// узнаваемым и выпадает из типографики. Почему не сток-фотографии, как в
// макете: лицензия, вес в репозитории и главное — снимок чужого борща не
// имеет отношения к тому, что человек съел. Настоящее фото у нас уже есть
// там, где человек его сделал; значок закрывает всё остальное.
//
// Цвет приходит из lib/food-category.ts тоном и насыщенностью, светлоту
// подставляет CSS вместе с темой (`.food-icon` в app/tg/tg.css).

import type { CSSProperties, ReactElement } from "react";
import { type FoodCategory, foodCategory, foodCategoryInfo, mealCategory } from "@/lib/food-category";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const GLYPHS: Record<FoodCategory, ReactElement> = {
  // Яичница, а не яйцо в скорлупе: у скорлупы желток оказывается ровно в
  // центре, две концентрические окружности читаются мишенью. Неровный белок
  // со смещённым желтком ни с чем не путается.
  egg: <g {...stroke}>
    <path d="M6.2 9.6c1.1-3.3 4.4-5.2 7.6-4.3 2.2.6 3.1 2.4 4.3 3.4 1.6 1.3 2.5 3 2.1 4.8-.5 2.3-2.9 3.5-5.1 3.1-1.5-.3-2.4-1.2-3.8-1.1-1.7.1-2.9 1.5-4.6 1.1-2.3-.5-3.4-3-2.5-5.1Z" />
    <circle cx="10.4" cy="11.2" r="2.5" />
  </g>,

  fish: <g {...stroke}>
    <path d="M20.4 12c0 0-3.3 4.6-7.9 4.6S4.8 12 4.8 12s3.1-4.6 7.7-4.6S20.4 12 20.4 12Z" />
    <path d="M4.8 12 1.9 9.1v5.8L4.8 12Z" />
    <path d="M16.1 10.7h.01" strokeWidth="2.2" />
  </g>,

  // Голяшка: мясо одним кругом и толстая кость капсулой. Два одинаковых
  // кружка на конце кости (как рисуют мослы) на 24 пикселях складывались в
  // арахис и спорили со значком орехов.
  poultry: <g {...stroke}>
    <path d="M11.7 12.3 7.5 16.5" strokeWidth="3.6" />
    <circle cx="15.3" cy="8.7" r="5" />
    <path d="M12.9 12.7c1.4.5 2.9.3 4.1-.6" strokeWidth="1.3" opacity="0.55" />
  </g>,

  meat: <g {...stroke}>
    <path d="M4.8 13.8c0-4.5 3.5-7.6 8.1-7.6 4.1 0 7.1 2.5 7.1 5.9 0 3.2-2.4 5.4-5.1 6.3-2.6.9-4.4 1.5-6 1.5-2.5 0-4.1-2.3-4.1-6.1Z" />
    <path d="M9.4 12.6c1.6-1.1 3.6-1.1 5.2 0" />
  </g>,

  legume: <g {...stroke}>
    <path d="M4.6 10c2.7 5.4 12.1 5.4 14.8 0" />
    <circle cx="8.2" cy="12.7" r="2.3" />
    <circle cx="12" cy="13.6" r="2.3" />
    <circle cx="15.8" cy="12.7" r="2.3" />
  </g>,

  nuts: <g {...stroke}>
    <circle cx="9" cy="8.9" r="4.3" />
    <circle cx="15" cy="15.1" r="4.3" />
    <path d="m10.6 12.2 2.8 2.8" />
  </g>,

  dairy: <g {...stroke}>
    <path d="M7 4h10l-1.3 15.3a1.8 1.8 0 0 1-1.8 1.7h-3.8a1.8 1.8 0 0 1-1.8-1.7Z" />
    <path d="M7.6 10.5h8.8" />
  </g>,

  fruit: <g {...stroke}>
    <path d="M12 7.7c-1-1-2.3-1.6-3.6-1.6C6.1 6.1 4.2 8.4 4.2 11.7c0 3.9 2.9 8 5.4 8 1 0 1.5-.5 2.4-.5s1.4.5 2.4.5c2.5 0 5.4-4.1 5.4-8 0-3.3-1.9-5.6-4.2-5.6-1.3 0-2.6.6-3.6 1.6Z" />
    <path d="M12 7.7V4.4" />
    <path d="M12.4 5c1.1-1.6 2.8-2 4-1.6.2 1.4-.7 2.9-2.2 3.3" />
  </g>,

  vegetable: <g {...stroke}>
    <path d="M4.8 19.6C3.4 13.4 7.5 6.2 19.2 5.2c1 8.1-3.7 13.7-11.3 13.7-1 0-2 .2-3.1.7Z" />
    <path d="M6.4 17.9c2.5-3.6 5.6-6.2 9.2-7.8" />
  </g>,

  potato: <g {...stroke}>
    <path d="M6.4 7.3c2.5-2.7 7.6-3.8 10.9-1.6 3.3 2.1 3.7 6.7 1.4 10s-6.8 4.9-10.1 3.2C5.4 17.3 3.9 10 6.4 7.3Z" />
    <path d="M9.6 9.7h.01M13.9 8.9h.01M11.6 14.2h.01M15.4 13.4h.01" strokeWidth="2" />
  </g>,

  soup: <g {...stroke}>
    <path d="M3.6 11.4h16.8v.8a8.4 8.4 0 0 1-16.8 0Z" />
    <path d="M9.4 8.3c-1.1-1 .9-2 -.2-3" />
    <path d="M14.6 8.3c-1.1-1 .9-2 -.2-3" />
  </g>,

  fastfood: <g {...stroke}>
    <path d="M4.2 9.4a7.8 7.8 0 0 1 15.6 0Z" />
    <path d="M3.6 12.4h16.8" />
    <path d="M4.6 15.4h14.8" />
    <path d="M4.4 17.9h15.2a3 3 0 0 1-3 2.6H7.4a3 3 0 0 1-3-2.6Z" />
  </g>,

  sweet: <g {...stroke}>
    <path d="M6.2 13.2h11.6l-1.2 6.1a1.6 1.6 0 0 1-1.6 1.3H9a1.6 1.6 0 0 1-1.6-1.3Z" />
    <path d="M6.4 13.2c0-3.4 2.5-5.4 5.6-5.4s5.6 2 5.6 5.4" />
    <circle cx="12" cy="5.1" r="1.6" />
  </g>,

  bread: <g {...stroke}>
    <path d="M3.9 12.9c0-4 3.6-6.8 8.1-6.8s8.1 2.8 8.1 6.8v4.2a1.9 1.9 0 0 1-1.9 1.9H5.8a1.9 1.9 0 0 1-1.9-1.9Z" />
    <path d="m8.5 9.7-1.6 2.4M12.1 9.3l-1.6 2.4M15.7 9.7l-1.6 2.4" />
  </g>,

  grain: <g {...stroke}>
    <path d="M12 20.6V8.9" />
    <path d="M12 6.5c-1.3-1.3-1.3-3.1 0-4.4 1.3 1.3 1.3 3.1 0 4.4Z" />
    <path d="M12 10c-2.6 0-4-1.5-4-3.6 2.6 0 4 1.5 4 3.6Z" />
    <path d="M12 10c2.6 0 4-1.5 4-3.6-2.6 0-4 1.5-4 3.6Z" />
    <path d="M12 13.6c-2.6 0-4-1.5-4-3.6 2.6 0 4 1.5 4 3.6Z" />
    <path d="M12 13.6c2.6 0 4-1.5 4-3.6-2.6 0-4 1.5-4 3.6Z" />
  </g>,

  drink: <g {...stroke}>
    <path d="M6.6 7.6h10.8l-1.3 11.1a2 2 0 0 1-2 1.8h-4.2a2 2 0 0 1-2-1.8Z" />
    <path d="M5.1 7.6h13.8" />
    <path d="m13.6 7.6 1.9-4.2" />
  </g>,

  sauce: <g {...stroke}>
    <path d="M10.4 3.4h3.2v3.3l2.3 2.6c.4.5.7 1.1.7 1.8v7.4a2 2 0 0 1-2 2H9.4a2 2 0 0 1-2-2v-7.4c0-.7.2-1.3.7-1.8l2.3-2.6Z" />
    <path d="M7.6 12.9h8.8" />
  </g>,

  other: <g {...stroke}>
    <circle cx="12" cy="12" r="7.6" />
    <circle cx="12" cy="12" r="3.7" />
  </g>,
};

/**
 * Инлайновые переменные тона для контейнера. Нужны, когда цвет категории
 * должен покрасить не сам значок, а обёртку вокруг него: CSS-переменные
 * наследуются вниз по дереву, поэтому объявлять их на вложенном значке
 * бесполезно — родитель их не увидит.
 */
export function foodTint(category: FoodCategory): CSSProperties {
  const info = foodCategoryInfo(category);
  return { "--food-hue": info.hue, "--food-sat": `${info.sat}%` } as CSSProperties;
}

type FoodIconProps = {
  /** Название позиции — категория вычисляется из него (lib/food-category.ts). */
  name?: string;
  /** Готовая категория, если она уже посчитана выше по дереву. */
  category?: FoodCategory;
  /** `sm` — строка списка, `md` — миниатюра приёма пищи, `lg` — карточка. */
  size?: "sm" | "md" | "lg";
  /** Без круглой подложки — когда значок стоит внутри чужого контейнера. */
  bare?: boolean;
};

/** Цветной значок категории: круглая подложка тона категории и глиф внутри. */
export function FoodIcon({ name, category, size = "sm", bare = false }: FoodIconProps) {
  const key = category ?? foodCategory(name ?? "");
  const info = foodCategoryInfo(key);

  return <span
    className={`food-icon food-icon--${size}${bare ? " food-icon--bare" : ""}`}
    style={foodTint(key)}
    role="img"
    aria-label={info.label}
  >
    <svg viewBox="0 0 24 24" aria-hidden>{GLYPHS[key]}</svg>
  </span>;
}

/** Значок приёма пищи целиком — по основному блюду среди позиций. */
export function MealIcon({ items, size = "md" }: { items: string[]; size?: FoodIconProps["size"] }) {
  return <FoodIcon category={mealCategory(items)} size={size} />;
}

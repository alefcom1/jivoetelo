/**
 * Инлайн-режим: `@jivelo_bot борщ` в любом чате.
 *
 * Единственная функция бота, которая работает на людей, о нас не знающих.
 * Человек отвечает знакомому в общей беседе — «в борще 40–75 ккал на сто
 * грамм», — и подпись «через @jivelo_bot» видят все участники разговора.
 * Рассылка так не умеет: она доходит только до тех, кто уже подписан.
 *
 * Аккаунт для этого не нужен и не спрашивается. Инлайн-запрос приходит от
 * кого угодно, включая людей, которые бота ни разу не открывали, и требовать
 * привязки здесь значило бы выключить единственный входящий канал.
 *
 * ## Откуда числа
 *
 * Из тех же двух источников, что и страницы сайта: `lib/dishes.ts` (готовые
 * блюда с диапазонами рецептур) и `lib/food-reference.ts` (301 продукт на
 * 100 г). Своей «инлайновой» таблицы нет и быть не должно: ответ в чужом
 * чате обязан совпадать со страницей, на которую он же и ссылается.
 *
 * Блюда идут первыми при равном совпадении. «Борщ» человек спрашивает как
 * блюдо, а не как строку справочника, и диапазон рецептур ему полезнее
 * одного числа.
 *
 * Модуль чистый: ни базы, ни сети. Адреса приходят аргументом.
 */

import { escapeHtml } from "./markup.ts";
import { DISHES, midpoint, type Dish } from "../dishes.ts";
import { FOOD_REFERENCE, searchFoodReference, type ReferenceFood } from "../food-reference.ts";

/**
 * Позиция продукта в справочнике — стабильный идентификатор результата.
 *
 * Telegram требует уникальный id в пределах ответа и отводит на него 64
 * байта; русское название в UTF-8 их перебирает на пятнадцатом символе.
 * Карта строится один раз: справочник константный, а `indexOf` по нему на
 * каждом из десяти результатов — это три тысячи сравнений на запрос.
 */
const FOOD_INDEX = new Map(FOOD_REFERENCE.map((food, index) => [food, index] as const));

/** Больше Telegram всё равно не покажет без прокрутки, а мы платим временем. */
const MAX_RESULTS = 10;
/** Сколько блюд показать на пустой запрос — просто чтобы объяснить, что тут есть. */
const EMPTY_QUERY_SAMPLE = 6;

export type InlineLinks = {
  /** Страница блюда: `/skolko-kalorij/<slug>`. */
  dishUrl: (slug: string) => string;
  /** Куда зовём после ответа — расчёт своей нормы, он работает без аккаунта. */
  planUrl: string;
};

export type InlineArticle = {
  type: "article";
  id: string;
  title: string;
  description: string;
  input_message_content: { message_text: string; parse_mode: "HTML"; link_preview_options: { is_disabled: true } };
  reply_markup: { inline_keyboard: Array<Array<{ text: string; url: string }>> };
};

function dishMatches(query: string, dish: Dish): boolean {
  const needle = query.toLowerCase().replace(/ё/g, "е").trim();
  const name = dish.name.toLowerCase().replace(/ё/g, "е");
  return name.includes(needle) || needle.includes(name);
}

function dishResult(dish: Dish, links: InlineLinks): InlineArticle {
  const [min, max] = dish.kcal;
  const portionKcal = Math.round((midpoint(dish.kcal) * dish.portionG) / 100);
  const url = links.dishUrl(dish.slug);

  const text =
    `<b>${escapeHtml(dish.name)}</b> — ${min}–${max} ккал на 100 г.\n` +
    `Обычная порция ${dish.portionG} г (${escapeHtml(dish.portionLabel)}) — около ${portionKcal} ккал.\n\n` +
    `${escapeHtml(dish.summary)}\n\n` +
    `<a href="${escapeHtml(url)}">Откуда разброс и что его двигает</a>`;

  return {
    type: "article",
    id: `dish:${dish.slug}`,
    title: dish.name,
    // Диапазон прямо в подсказке: человек часто получает ответ, ещё не
    // отправив сообщение, и это нормальный исход — он и искал число.
    description: `${min}–${max} ккал на 100 г · порция ${dish.portionG} г ≈ ${portionKcal} ккал`,
    input_message_content: {
      message_text: text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    },
    reply_markup: { inline_keyboard: [[{ text: "Посчитать свою норму", url: links.planUrl }]] },
  };
}

function foodResult(food: ReferenceFood, index: number, links: InlineLinks): InlineArticle {
  const portionKcal = Math.round((food.kcal * food.portionG) / 100);
  const text =
    `<b>${escapeHtml(food.name)}</b> — ${food.kcal} ккал на 100 г.\n` +
    `Белок ${food.protein} г, жиры ${food.fat} г, углеводы ${food.carbs} г.\n` +
    `Порция ${food.portionG} г — около ${portionKcal} ккал.`;

  return {
    type: "article",
    id: `food:${index}`,
    title: food.name,
    description: `${food.kcal} ккал на 100 г · белок ${food.protein} г · порция ${food.portionG} г`,
    input_message_content: {
      message_text: text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    },
    reply_markup: { inline_keyboard: [[{ text: "Посчитать свою норму", url: links.planUrl }]] },
  };
}

/**
 * Ответ на инлайн-запрос. Пустой запрос — не ошибка: Telegram шлёт его сразу
 * после набора «@jivelo_bot», и показать в этот момент несколько блюд
 * полезнее, чем пустоту, по которой не понять, что бот вообще умеет.
 */
export function inlineResults(query: string, links: InlineLinks): InlineArticle[] {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return DISHES.slice(0, EMPTY_QUERY_SAMPLE).map((dish) => dishResult(dish, links));
  }
  // Одна буква совпадает с чем угодно — показывать по ней «результаты» значит
  // выдавать случайный список за ответ.
  if (trimmed.length < 2) return [];

  const dishes = DISHES.filter((dish) => dishMatches(trimmed, dish)).map((dish) => dishResult(dish, links));

  const foods = searchFoodReference(trimmed, MAX_RESULTS).map((food) =>
    foodResult(food, FOOD_INDEX.get(food) ?? -1, links),
  );

  return [...dishes, ...foods].slice(0, MAX_RESULTS);
}

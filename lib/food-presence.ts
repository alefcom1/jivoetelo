/**
 * «В кадре еда?» — по выходу классификатора ImageNet.
 *
 * ## Что здесь происходит
 *
 * Модель обучена на ImageNet-1k и отвечает вероятностями тысячи классов.
 * Своего класса «еда» там нет, но есть подряд идущий блок съедобного —
 * с 924 (гуакамоле) по 969 (эгног), — плюс посуда и обстановка стола,
 * разбросанные по остальному списку. Сумма вероятностей этого блока и есть
 * ответ на наш вопрос.
 *
 * Задачу «что именно за блюдо» так решить нельзя, и мы её здесь не решаем:
 * борща, гречки и плова в ImageNet нет вовсе. Разбор состава делает модель
 * на сервере после снимка — она видит кадр целиком и знает контекст.
 *
 * ## Почему посуда считается отдельно и слабее
 *
 * Тарелка, миска и накрытый стол — не еда, но и не случайность: в кадре с
 * тарелкой почти всегда что-то есть. При этом пустая тарелка тоже даёт
 * высокий отклик, поэтому её вес вдвое меньше — она поддерживает решение,
 * но не принимает его в одиночку.
 *
 * ## Ограничения, которые важно помнить
 *
 * Русская кухня в этот список попадает косвенно: борщ опознаётся как
 * consomme или soup bowl, гречка — как mashed potato или plate. Это
 * достаточно для ответа «да, похоже на еду» и совершенно недостаточно для
 * ответа «это гречка». Поэтому подсказка на экране никогда не называет
 * блюдо и никогда ничего не запрещает — только поощряет снимок.
 */

/** Блок съедобного в ImageNet-1k. 958 (hay) в него не входит: это сено. */
export const FOOD_CLASSES: number[] = [
  ...Array.from({ length: 969 - 924 + 1 }, (_, i) => 924 + i).filter((index) => index !== 958),
  987, // corn
  998, // ear of corn
];

/**
 * Обстановка еды: посуда, стол, кухонная утварь. Не еда сама по себе,
 * поэтому вес вдвое меньше — см. рассуждение выше.
 */
export const CONTEXT_CLASSES: number[] = [
  532, // dining table
  544, // Dutch oven
  567, // frying pan
  647, // measuring cup
  659, // mixing bowl
  762, // restaurant
  766, // rotisserie
  809, // soup bowl
  868, // tray
  909, // wok
  923, // plate
];

const CONTEXT_WEIGHT = 0.5;

/**
 * Порог уверенности.
 *
 * Подобран по замеру на фотографиях (scripts/food-probe.mjs): на снимках еды
 * счёт получался заметно выше, на посторонних кадрах — заметно ниже. Место
 * между этими группами широкое, поэтому точное значение не критично; важно,
 * что ошибка в любую сторону стоит недорого. Подсказка ничего не запрещает:
 * ложное «еды не вижу» — это отсутствие поощрения, а не отказ снимать.
 */
export const FOOD_THRESHOLD = 0.12;

/** Softmax по логитам. Модель отдаёт именно логиты, а не вероятности. */
export function softmax(logits: ArrayLike<number>): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const out = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    // Вычитание максимума — не украшение: без него exp переполняется и
    // весь вектор превращается в NaN.
    const value = Math.exp(logits[i] - max);
    out[i] = value;
    sum += value;
  }
  if (sum > 0) for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

/** Счёт «похоже на еду», 0..1. */
export function foodScore(probabilities: ArrayLike<number>): number {
  let food = 0;
  for (const index of FOOD_CLASSES) food += probabilities[index] ?? 0;
  let context = 0;
  for (const index of CONTEXT_CLASSES) context += probabilities[index] ?? 0;
  return Math.min(1, food + context * CONTEXT_WEIGHT);
}

export function looksLikeFood(probabilities: ArrayLike<number>): boolean {
  return foodScore(probabilities) >= FOOD_THRESHOLD;
}

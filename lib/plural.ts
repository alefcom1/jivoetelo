/**
 * Русские числительные. Вынесено в отдельный модуль, потому что правило
 * нетривиально в двух местах сразу: 11–14 ведут себя как «много» вопреки
 * последней цифре, а 111 — снова как «много», хотя оканчивается на единицу.
 *
 * Формы задаются в порядке: 1 фото, 2 фото, 5 фото.
 */
export type PluralForms = readonly [one: string, few: string, many: string];

export function pluralRu(count: number, forms: PluralForms): string {
  const n = Math.abs(Math.trunc(count));
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  const last = n % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** «3 фотографии» — число вместе с согласованной формой слова. */
export function withPluralRu(count: number, forms: PluralForms): string {
  return `${count} ${pluralRu(count, forms)}`;
}

/**
 * Ссылки оплаты для конкретного человека — в одном месте.
 *
 * Раньше их собирала страница настроек, а потом ровно тот же код появился в
 * ответе Mini App. Третьим местом должен был стать отказ «пробный месяц
 * закончился», и на третьей копии стало видно, что это одна функция: список
 * тарифов, подписанная метка человека и проверка «а включён ли вообще приём
 * денег». Разойдись эти копии — и часть экранов покажет кнопки, ведущие в
 * никуда, а часть не покажет их там, где человек как раз готов заплатить.
 *
 * Метка подписывается здесь, на сервере, потому что здесь живёт секрет. В
 * клиентские компоненты приходит уже готовый адрес.
 */

import { ACCESS_ANCHOR, TARIFFS, type AccessOffer } from "../paid.ts";
import type { QuotaDenial } from "../quota-policy.ts";
import { getTributeConfig, paymentLink } from "./tribute.ts";

// Якорь объявлен в lib/paid.ts и переэкспортируется отсюда: серверный код
// про оплату берёт всё из одного места, а клиентский — из paid.ts, без
// node:crypto в бандле.
export { ACCESS_ANCHOR };

export type PayLink = {
  key: string;
  label: string;
  priceRub: number;
  url: string;
};

/**
 * Ссылки на все тарифы — или `null`, когда приём денег выключен.
 *
 * Именно `null`, а не пустой массив: «оплата не настроена» и «тарифов нет» —
 * разные вещи, и экран на них отвечает по-разному. Кнопка со словами «скоро»
 * хуже отсутствия кнопки: человек нажимает и упирается в пустоту.
 */
export function payLinksFor(userId: number): PayLink[] | null {
  const config = getTributeConfig();
  if (!config?.enabled) return null;
  return TARIFFS.map((tariff) => ({
    key: tariff.key,
    label: tariff.label,
    priceRub: tariff.priceRub,
    url: paymentLink(config, tariff.key, userId),
  }));
}

/**
 * Одна ссылка для тесного места — отказа в разборе.
 *
 * Там, где человек только что упёрся в закрытый доступ, две кнопки с ценами
 * превращают сообщение об отказе в прейскурант. Показываем самый дешёвый
 * вход, а остальные варианты — включая ваучер и приглашение друга — живут по
 * ссылке на раздел «Доступ», куда и ведёт вторая, тихая строка.
 */
export function cheapestPayLink(userId: number): PayLink | null {
  const links = payLinksFor(userId);
  if (!links || links.length === 0) return null;
  return links.reduce((best, link) => (link.priceRub < best.priceRub ? link : best));
}

/**
 * Кнопка оплаты прямо в отказе — `undefined`, если предлагать нечего.
 *
 * ## Зачем это вообще
 *
 * Момент, когда человек упёрся в «пробный месяц закончился», — единственная
 * точка, где он готов заплатить прямо сейчас: он только что хотел разобрать
 * фотографию и не смог. А получал он текст, отправляющий искать раздел
 * настроек, то есть навигацию по интерфейсу между желанием и оплатой.
 *
 * `undefined` возвращается для всех прочих отказов. Дневной лимит — не повод
 * звать платить: исчерпать его может только тот, у кого доступ уже открыт, и
 * предложение купить то, что куплено, показывает, что сервис не знает, с кем
 * разговаривает. `null` — другое: доступа нет, но приём денег выключен, и
 * тогда экран показывает только путь через приглашение.
 */
export function accessOffer(denial: QuotaDenial, userId: number): AccessOffer | undefined {
  if (denial.reason !== "no_access") return undefined;
  const link = cheapestPayLink(userId);
  if (!link) return null;
  return {
    payUrl: link.url,
    payLabel: `Открыть разбор — ${link.priceRub} ₽ за ${link.label.toLowerCase()}`,
  };
}

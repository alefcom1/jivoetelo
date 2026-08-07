/**
 * Меню бота: постоянная клавиатура под строкой ввода и список команд.
 *
 * ## Зачем клавиатура, если есть команды
 *
 * Команд у бота набралось семь, и узнать о них можно было ровно двумя
 * способами: прочитать `/help` целиком или открыть список за косой чертой.
 * Оба требуют, чтобы человек сначала догадался их поискать. Постоянная
 * клавиатура убирает этот шаг: действия видно всё время, и нажатие — это
 * одно движение вместо «вспомнить название команды и напечатать его».
 *
 * ## Один источник на три места
 *
 * Надписи на кнопках, список за косой чертой и разбор нажатий описаны здесь
 * одним массивом. Разложить их по трём местам — значит однажды переименовать
 * кнопку и получить нажатие, которое бот не узнаёт: Telegram присылает
 * нажатие обычным сообщением с текстом надписи, никакого отдельного признака
 * у него нет. Отказ при этом выглядел бы как «бот не отвечает на свою же
 * кнопку» — то есть как поломка, а не как опечатка.
 *
 * ## Почему не ссылки
 *
 * Кнопки постоянной клавиатуры не умеют быть ссылками — Telegram разрешает
 * там только текст, запрос контакта и `web_app`. Поэтому «Дневник» открывает
 * Mini App напрямую, когда тот заведён, а без него отправляет команду, и
 * человек получает сообщение с обычной ссылкой. Разница в один тап, зато
 * работает в обоих случаях.
 */

import type { BotLinks } from "./links.ts";

export type MenuItem = {
  /** Надпись. Её же Telegram присылает обратно текстом при нажатии. */
  label: string;
  /** Во что превращается нажатие. */
  command: string;
  /** Строка для списка за косой чертой. */
  description: string;
  /** Кнопка появляется, только когда включён приём оплаты. */
  paidOnly?: boolean;
  /**
   * Открывать Mini App прямо с клавиатуры, не гоняя человека через сообщение.
   * Осмысленно только для дневника: остальные пункты — это ответ бота.
   */
  opensApp?: boolean;
};

/**
 * Порядок — по частоте, а не по важности. Сверху то, что делают каждый день:
 * дневник и вес. Ниже — то, к чему возвращаются раз в неделю. В самом низу
 * редкое, включая премиум: кнопка оплаты на первом экране читается как
 * просьба заплатить прежде, чем человек успел понять, за что.
 */
export const MENU: MenuItem[] = [
  { label: "📔 Дневник", command: "/app", description: "Открыть дневник", opensApp: true },
  { label: "⚖️ Записать вес", command: "/weight", description: "Записать вес" },
  { label: "📊 Итог дня", command: "/day", description: "Сколько съедено сегодня" },
  { label: "⚙️ Настройки", command: "/settings", description: "Напоминания и доступ" },
  { label: "🎁 Позвать друга", command: "/invite", description: "Позвать знакомых" },
  { label: "❓ Помощь", command: "/help", description: "Что я умею" },
  { label: "💎 Премиум", command: "/premium", description: "Платный доступ", paidOnly: true },
];

/**
 * Команды, которых на клавиатуре нет.
 *
 * `/start` — потому что нажимать «начать сначала» посреди работы незачем, а в
 * списке он нужен: Telegram показывает его новичку кнопкой сам.
 * `/stop` и `/stopweight` — потому что кнопка «выключить напоминания» рядом с
 * ежедневными действиями подсказывает решение, которого человек не искал.
 * В настройках им место, в постоянном меню — нет.
 */
const EXTRA_COMMANDS: Array<{ command: string; description: string }> = [
  { command: "/start", description: "Как всё устроено" },
  { command: "/stop", description: "Выключить вечерние напоминания" },
];

export type ReplyKeyboard = {
  keyboard: Array<Array<{ text: string } | { text: string; web_app: { url: string } }>>;
  resize_keyboard: true;
  is_persistent: true;
  input_field_placeholder?: string;
};

function visible(paymentsEnabled: boolean): MenuItem[] {
  return MENU.filter((item) => !item.paidOnly || paymentsEnabled);
}

/**
 * Клавиатура по два столбца.
 *
 * `resize_keyboard` — иначе Telegram растягивает кнопки на треть экрана и
 * переписка уезжает вверх. `is_persistent` — иначе клавиатура прячется после
 * первого нажатия, и человек, нажавший «Итог дня», теряет остальные кнопки
 * ровно в тот момент, когда они ему понадобились.
 *
 * Подпись в поле ввода делает то, чего не делает ни одна кнопка: называет
 * два действия, у которых кнопки быть не может, — прислать фото и написать
 * вес числом.
 */
export function mainKeyboard(links: BotLinks, paymentsEnabled = false): ReplyKeyboard {
  const rows: ReplyKeyboard["keyboard"] = [];
  for (const item of visible(paymentsEnabled)) {
    const button = item.opensApp && links.miniAppUrl
      ? { text: item.label, web_app: { url: links.miniAppUrl } }
      : { text: item.label };
    const last = rows.at(-1);
    if (last && last.length === 1) last.push(button);
    else rows.push([button]);
  }
  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Фото еды или вес числом",
  };
}

/**
 * Нажатие на кнопку — в команду. Возвращает исходный текст, если это не
 * кнопка: разбор сообщений дальше идёт как обычно.
 *
 * Сверяем и с надписью целиком, и с ней же без значка. Значок в начале —
 * единственное, что человек может не воспроизвести, набирая «Итог дня»
 * руками, а отказ узнать собственную кнопку выглядит как поломка бота.
 */
const BY_LABEL = new Map<string, string>();
for (const item of MENU) {
  BY_LABEL.set(item.label.toLowerCase(), item.command);
  BY_LABEL.set(withoutIcon(item.label), item.command);
}

function withoutIcon(label: string): string {
  return label.replace(/^[^\p{L}]+/u, "").trim().toLowerCase();
}

export function commandFromLabel(text: string): string {
  return BY_LABEL.get(text.trim().toLowerCase()) ?? BY_LABEL.get(withoutIcon(text)) ?? text;
}

/**
 * Список для `setMyCommands` — тот, что Telegram показывает по косой черте.
 *
 * Раньше он жил в scripts/webhook.mjs и обновлялся только при регистрации
 * вебхука. Мы работаем опросом, вебхук не регистрируем — и список так и остался
 * из четырёх команд, притом что бот отвечает на семь. Теперь он собирается
 * из того же массива, что и клавиатура, и обновляется при каждом запуске.
 */
export function botCommands(paymentsEnabled = false): Array<{ command: string; description: string }> {
  const fromMenu = visible(paymentsEnabled).map((item) => ({
    command: item.command.replace(/^\//, ""),
    description: item.description,
  }));
  const extra = EXTRA_COMMANDS.map((item) => ({
    command: item.command.replace(/^\//, ""),
    description: item.description,
  }));
  // `/start` первым: Telegram показывает начало списка в подсказке новичку.
  return [extra[0], ...fromMenu, ...extra.slice(1)];
}

/**
 * Список команд и синяя кнопка рядом со строкой ввода — то, что Telegram
 * хранит у себя и показывает до всякой переписки.
 *
 * ## Почему при запуске, а не разовым скриптом
 *
 * Раньше это делалось в `scripts/webhook.mjs`, при регистрации вебхука. Мы
 * работаем опросом (lib/bot/transport.ts), вебхук не регистрируем — и список
 * так и остался тем, каким его записали однажды: четыре команды при семи
 * рабочих. Заметить это невозможно, потому что бот отвечает на все семь, а по
 * косой черте видно четыре; выглядит как «Telegram что-то подтормаживает».
 *
 * Запуск — единственный момент, который случается ровно тогда, когда состав
 * команд мог измениться: код обновился, контейнер поднялся. Два вызова к Bot
 * API на старт стоят дёшево и убирают целый класс расхождений «в коде одно, у
 * Telegram другое».
 *
 * ## Отказ здесь не должен ронять бота
 *
 * Ни список команд, ни кнопка меню не влияют на приём сообщений: без них бот
 * работает, просто хуже выглядит. Поэтому ошибки ловим и записываем, но
 * наружу не пускаем — иначе недоступный на секунду Bot API оставил бы нас без
 * опроса вовсе.
 */

import { botCommands } from "./menu.ts";
import { reportBotProblem } from "./health.ts";
import type { BotLinks } from "./links.ts";
import type { TelegramClient } from "../telegram-api.ts";

export async function registerBotUi(
  client: TelegramClient,
  links: BotLinks,
  paymentsEnabled: boolean,
): Promise<void> {
  try {
    await client.call("setMyCommands", { commands: botCommands(paymentsEnabled) });
    console.log(`[bot] список команд обновлён: ${botCommands(paymentsEnabled).length} шт.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bot] не удалось задать список команд:", error);
    reportBotProblem(`список команд не обновлён: ${message}`);
  }

  // Синяя кнопка «Дневник» слева от строки ввода. Без Mini App ставить нечего:
  // кнопка меню умеет быть только веб-приложением или списком команд, а
  // ссылкой — нет. Тогда оставляем список команд, он там по умолчанию.
  if (!links.miniAppUrl) return;
  try {
    await client.call("setChatMenuButton", {
      menu_button: { type: "web_app", text: "Дневник", web_app: { url: links.miniAppUrl } },
    });
    console.log(`[bot] кнопка «Дневник» открывает ${links.miniAppUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[bot] кнопку Mini App поставить не удалось:", error);
    // Самая частая причина — домен не привязан к боту, и по одному сообщению
    // Telegram это не понять. Называем шаг прямо здесь: искать его в
    // документации в момент отказа никто не станет.
    reportBotProblem(
      `кнопка Mini App не поставлена: ${message}. Обычно это значит, что домен не привязан `
        + "к боту: в @BotFather /setdomain → выбрать бота → адрес Mini App.",
    );
  }
}

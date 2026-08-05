/**
 * Отправить другу из Mini App.
 *
 * ## Два пути и почему их два
 *
 * `shareMessage` из Bot API 8.0 показывает нативный выбор получателя, не
 * уводя человека из приложения, — это лучший вариант там, где он есть. Есть
 * он не везде: у части клиентов версия ниже, и вызов просто ничего не сделает.
 * Молча несработавшая кнопка хуже некрасивой, поэтому запасной путь
 * обязателен — `t.me/share/url` работает во всех клиентах и на десктопе.
 *
 * Та же развилка уже была при обновлении «Сегодня»: там от события `activated`
 * из 8.0 отказались в пользу `visibilitychange` по этой же причине.
 */

import { getWebApp } from "./telegram";
import { telegramShareLink } from "@/lib/share-text";

type WebAppWithShare = {
  shareMessage?: (id: string, callback?: (sent: boolean) => void) => void;
  openTelegramLink?: (url: string) => void;
};

/**
 * Открыть выбор получателя с готовым текстом.
 *
 * `shareMessage` требует заранее подготовленного сообщения на стороне бота
 * (savePreparedInlineMessage), поэтому им пользуемся только когда такой
 * идентификатор пришёл с сервера. Пока его нет — обычная ссылка, и это не
 * временное решение, а рабочее: она открывает тот же выбор чата.
 */
export function shareToTelegram(text: string, preparedId?: string | null): void {
  const app = getWebApp() as (ReturnType<typeof getWebApp> & WebAppWithShare) | null;
  if (preparedId && typeof app?.shareMessage === "function") {
    app.shareMessage(preparedId);
    return;
  }

  const link = telegramShareLink(text);
  // openTelegramLink закрывает Mini App и открывает выбор чата внутри
  // клиента. Обычный window.open в Telegram открыл бы браузер поверх
  // приложения — то есть увёл бы человека из Telegram, чтобы вернуть в
  // Telegram.
  if (typeof app?.openTelegramLink === "function") app.openTelegramLink(link);
  else window.open(link, "_blank", "noopener");
}

/**
 * Скопировать текст — запасной путь для всего остального: соцсети, почта,
 * заметки. Своей кнопки «во ВКонтакте» здесь нет сознательно: набор сетей
 * у каждого свой, а системный лист выбора умеет их все.
 */
export async function copyOrShare(text: string): Promise<"shared" | "copied" | "failed"> {
  // Системный лист выбора — то, чего ждут на телефоне: он покажет и соцсети,
  // и мессенджеры, и заметки, без нашего списка кнопок.
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch {
      // Отмена выбора — не ошибка: человек передумал. Падать в «не вышло»
      // здесь нельзя, но и молчать не надо — просто копируем.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

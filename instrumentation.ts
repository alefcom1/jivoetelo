/**
 * Точка запуска фоновых задач. Next вызывает register() один раз при старте
 * сервера — этого достаточно, чтобы поднять планировщик писем и напоминаний
 * внутри того же процесса, не заводя отдельный контейнер.
 *
 * Оговорка на будущее: это работает, пока приложение живёт в одном
 * экземпляре. Захваты в планировщике написаны так, что второй экземпляр не
 * отправит ничего дважды, но полагаться на это как на архитектуру не стоит —
 * при масштабировании планировщик лучше вынести отдельно.
 */
export async function register() {
  // Есть ещё edge-рантайм, где нет ни таймеров такого рода, ни доступа к базе.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScheduler } = await import("./lib/scheduler.ts");
  startScheduler();

  // Бот. Настройку в Telegram приводим в порядок при каждом старте — это
  // была ручная команда на сервере, о которой забывали навсегда. Не ждём
  // результата: приложение должно подняться независимо от того, доступен ли
  // сейчас Bot API.
  //
  // Транспорт выбирается сам (lib/bot/transport.ts): за прокси Telegram до
  // нас не достучится, и сообщения приходится забирать самим.
  const { botTransport } = await import("./lib/bot/transport.ts");
  if (botTransport() === "polling") {
    const { startPolling } = await import("./lib/bot/polling.ts");
    startPolling();
    // Команды и кнопку Mini App выставить всё равно нужно — вебхук при этом
    // не регистрируется, его снимает сам опрос.
    const { ensureBotProfile } = await import("./lib/bot/ensure-webhook.ts");
    void ensureBotProfile();
  } else {
    const { ensureWebhook } = await import("./lib/bot/ensure-webhook.ts");
    void ensureWebhook();
  }
}

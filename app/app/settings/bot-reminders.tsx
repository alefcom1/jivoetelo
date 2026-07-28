import { DEFAULT_DIGEST_HOUR, MAX_DIGEST_HOUR, MIN_DIGEST_HOUR } from "@/lib/reminders";
import { saveBotPreferences } from "../bot-actions";

const HOURS = Array.from({ length: MAX_DIGEST_HOUR - MIN_DIGEST_HOUR + 1 }, (_, i) => MIN_DIGEST_HOUR + i);

/**
 * Напоминания в боте. Показываем только привязавшим Telegram: настраивать
 * сообщения, которые некому доставить, — способ запутать.
 */
export function BotReminders({
  remindersEnabled,
  digestHour,
  snoozedUntil,
}: {
  remindersEnabled: boolean;
  digestHour: number;
  snoozedUntil: Date | null;
}) {
  const snoozeActive = snoozedUntil !== null && snoozedUntil > new Date();

  return <form className="bot-reminders" action={saveBotPreferences}>
    <label className="consent">
      <input type="checkbox" name="remindersEnabled" defaultChecked={remindersEnabled} />
      <span>Присылать вечернее напоминание в Telegram</span>
    </label>

    <label className="bot-hour">
      Не раньше
      <select name="digestHour" defaultValue={String(digestHour || DEFAULT_DIGEST_HOUR)}>
        {HOURS.map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
      </select>
    </label>

    <p className="field-note">
      Не больше одного сообщения в день, и только если есть о чём: неразобранные снимки в инбоксе или
      совсем пустой день. Ночью бот молчит.
    </p>
    {snoozeActive &&
      <p className="field-note">
        Сейчас включена пауза до {snoozedUntil.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}.
        Сохранение настроек снимет её.
      </p>}

    <button className="black-button" type="submit">Сохранить</button>
  </form>;
}

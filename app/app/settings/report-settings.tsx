import { CHANNEL_SETTINGS, type ChannelSetting, type ReportPreferences } from "@/lib/report-prefs";
import { saveReportPreferences } from "../report-actions";

/**
 * Подписи вариантов. «Авто» стоит первым и объясняется прямо в подписи: без
 * этого он читается как «сервис решит за вас», хотя означает «туда, где вы
 * есть».
 */
const CHANNEL_LABELS: Record<ChannelSetting, string> = {
  auto: "Автоматически",
  telegram: "В Telegram",
  email: "На почту",
  both: "И туда, и туда",
  off: "Не присылать",
};

function ChannelField({ name, label, value, hint }: {
  name: string;
  label: string;
  value: ChannelSetting;
  hint: string;
}) {
  return <label className="report-field">
    <span>{label}</span>
    <select name={name} defaultValue={value}>
      {CHANNEL_SETTINGS.map((setting) => (
        <option key={setting} value={setting}>{CHANNEL_LABELS[setting]}</option>
      ))}
    </select>
    <small>{hint}</small>
  </label>;
}

export function ReportSettings({ prefs, hasEmail, hasTelegram }: {
  prefs: ReportPreferences;
  hasEmail: boolean;
  hasTelegram: boolean;
}) {
  const auto = hasTelegram
    ? "Сейчас «автоматически» — это Telegram для недели и почта для месяца."
    : hasEmail
      ? "Сейчас «автоматически» — это почта: Telegram не привязан."
      : "Ни почты, ни Telegram — отчёт отправить некуда. Укажите почту или привяжите бота.";

  return <form className="report-settings" action={saveReportPreferences}>
    <ChannelField
      name="weekly"
      label="Недельный отчёт"
      value={prefs.weekly}
      hint="Приходит по понедельникам утром за прошедшую неделю."
    />
    <ChannelField
      name="monthly"
      label="Месячный отчёт"
      value={prefs.monthly}
      hint="Первого числа за прошедший месяц. В нём же — разбор «еда и вес», когда наблюдений хватит."
    />

    <label className="consent">
      <input type="checkbox" name="weightNumbers" defaultChecked={prefs.weightNumbers} />
      <span>Показывать в отчёте вес в килограммах</span>
    </label>
    <p className="field-note">
      Если выключить, останется только изменение тренда — «−0,3 кг за неделю». Это изменение, а не вес.
    </p>

    <p className="field-note">{auto}</p>
    <p className="field-note">
      Отчёт не приходит, если за период было слишком мало записей: пересказывать два дня незачем,
      а по пустой неделе писать тем более.
    </p>

    <button className="black-button" type="submit">Сохранить</button>
  </form>;
}

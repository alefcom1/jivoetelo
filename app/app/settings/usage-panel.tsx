import { getUsageToday, OPERATION_LABELS, PLAN_LIMITS, type AiOperation, type Plan } from "@/lib/quota";

const ORDER: AiOperation[] = ["analyze_photo", "analyze_text", "transcribe", "suggest"];

/**
 * Показывает расход AI-операций за сегодня. Тон нейтральный: лимит — это
 * свойство сервиса, а не оценка пользователя (языковые правила 4.3).
 */
export async function UsagePanel({ userId, plan }: { userId: number; plan: Plan }) {
  const used = await getUsageToday(userId);
  const limits = PLAN_LIMITS[plan];

  // Доступа нет — таблицы расхода тоже нет. Показывать «0 из 0» пятью
  // строками с пустыми полосками значило бы отчитываться о том, чего не
  // происходит, да и деление на ноль дало бы NaN в ширине полосы.
  if (limits.analyze_photo <= 0) {
    return <div className="usage-panel">
      <p className="usage-lead">
        Пробный месяц закончился, поэтому обращения к распознаванию сейчас не расходуются.
        Дневник, план, вес, обзоры и каталог работают как раньше — еду можно записывать руками.
        Открыть разбор снова можно в блоке «Доступ» выше.
      </p>
    </div>;
  }

  return <div className="usage-panel">
    <p className="usage-lead">
      Дневник, план, вес и обзоры доступны без ограничений. Дневные лимиты
      относятся только к распознаванию — записать еду руками можно всегда,
      в том числе когда лимит на сегодня исчерпан.
    </p>
    <ul className="usage-list">
      {ORDER.map((operation) => {
        const value = used[operation];
        const limit = limits[operation];
        const pct = Math.min(100, Math.round((value / limit) * 100));
        return <li key={operation}>
          <div className="usage-head">
            <span>{OPERATION_LABELS[operation][0].toUpperCase() + OPERATION_LABELS[operation].slice(1)}</span>
            <b>{value} из {limit}</b>
          </div>
          <div className="usage-track"><div className="usage-fill" style={{ width: `${pct}%` }} /></div>
        </li>;
      })}
    </ul>
    <p className="field-note">
      Счётчик обнуляется каждый день. Записывать еду вручную можно без ограничений.
    </p>
  </div>;
}

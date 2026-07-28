import { getUsageToday, OPERATION_LABELS, PLAN_LIMITS, type AiOperation, type Plan } from "@/lib/quota";

const ORDER: AiOperation[] = ["analyze_photo", "analyze_text", "suggest"];

/**
 * Показывает расход AI-операций за сегодня. Тон нейтральный: лимит — это
 * свойство сервиса, а не оценка пользователя (языковые правила 4.3).
 */
export async function UsagePanel({ userId, plan }: { userId: number; plan: Plan }) {
  const used = await getUsageToday(userId);
  const limits = PLAN_LIMITS[plan];

  return <div className="usage-panel">
    <p className="usage-lead">
      Все функции сервиса доступны бесплатно. Дневные лимиты на распознавание нужны только
      для того, чтобы сервис оставался быстрым и доступным для всех — обычному дню они не мешают.
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

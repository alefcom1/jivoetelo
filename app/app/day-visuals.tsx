/**
 * Итоги дня в кабинете: кольцо энергии и полосы макросов.
 *
 * ## Зачем понадобилось
 *
 * В Mini App итоги дня выглядят кольцом и цветными полосами, а в веб-кабинете
 * ровно те же числа стояли пятью одинаковыми прямоугольниками с рамкой. Это
 * заметили сразу, как только на главную вместо нарисованного макета встал
 * настоящий снимок: продукт в вебе выглядел таблицей.
 *
 * Компонент серверный — ни состояния, ни обработчиков здесь нет, только
 * арифметика и разметка. В браузер не уезжает ничего.
 *
 * ## Почему кольцо, а не полоса, для энергии
 *
 * Энергия — единственное число, на которое человек смотрит первым. Кольцо
 * держит взгляд в одной точке и читается с расстояния; полоса в ряду с
 * четырьмя такими же теряется. Остальные макросы, наоборот, полезно
 * сравнивать между собой — а это как раз работа для одинаковых полос.
 *
 * ## Чего здесь нет
 *
 * Красного цвета при превышении и слов «много», «мало», «отлично». Сервис
 * показывает, что было; выводы делает человек. Поэтому переполненная полоса
 * просто останавливается на краю, а не краснеет.
 */

/** Оттенки берём из тех же тонов, что в Mini App, — набор должен совпадать. */
const MACRO_HUE: Record<string, number> = {
  protein: 212,
  fat: 38,
  carbs: 276,
  fiber: 142,
};

export function EnergyRing({ value, target }: { value: number; target: number | null }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  // Без цели кольцо остаётся пустым: рисовать долю от неизвестного нечестно.
  const share = target && target > 0 ? Math.min(1, value / target) : 0;

  return <div className="day-ring">
    <svg viewBox="0 0 120 120" role="img" aria-label={target ? `Съедено ${value} из ${target} ккал` : `Съедено ${value} ккал`}>
      <defs>
        {/* Градиент вдоль дуги в userSpace: от bounding box самой дуги он на
            малом заполнении сжался бы в одно пятно. */}
        <linearGradient id="day-ring-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="120" y2="120">
          <stop offset="0%" stopColor="var(--coral)" />
          <stop offset="100%" stopColor="hsl(38 90% 58%)" />
        </linearGradient>
      </defs>
      <circle className="day-ring-track" cx="60" cy="60" r={radius} />
      <circle
        className="day-ring-value"
        cx="60" cy="60" r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - share)}
      />
    </svg>
    <div className="day-ring-center">
      <strong>{value}</strong>
      <span>{target ? `из ${target} ккал` : "ккал"}</span>
      {target ? <em>{Math.round(share * 100)}%</em> : null}
    </div>
  </div>;
}

export function MacroBar({ label, value, target, unit, macro }: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  /** Ключ из MACRO_HUE — он же задаёт цвет полосы. */
  macro: keyof typeof MACRO_HUE;
}) {
  const pct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return <div className="day-bar" style={{ "--macro-hue": MACRO_HUE[macro] } as React.CSSProperties}>
    <div className="day-bar-head">
      <span>{label}</span>
      <b>{value}{target ? <i> / {target}</i> : null} {unit}</b>
    </div>
    {/* Без цели дорожку не рисуем вовсе: пустая полоса выглядит как ноль
        из чего-то, а на деле «не знаем, из чего». */}
    {target ? <div className="day-bar-track"><div className="day-bar-fill" style={{ width: `${pct}%` }} /></div> : null}
  </div>;
}

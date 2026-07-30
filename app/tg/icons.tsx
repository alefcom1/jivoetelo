// Иконки навигации: единый геометрический набор, одна толщина штриха,
// скруглённые концы. Без эмодзи и без смешения библиотек (раздел 10.7 спеки).

type IconProps = { active?: boolean };

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Тарелка — дневник дня. В активном состоянии заливается. */
export function IconToday({ active }: IconProps) {
  return <svg {...base}>
    <path d="M4 11.5h16a8 8 0 0 1-8 8 8 8 0 0 1-8-8Z" fill={active ? "currentColor" : "none"} />
    <path d="M9 8c0-1.2.6-1.8 1.5-2.5" />
    <path d="M14 8c0-1.2.6-1.8 1.5-2.5" />
  </svg>;
}

/** Плюс в круге — вкладка «Камера», мгновенный разбор еды. */
export function IconAdd({ active }: IconProps) {
  return <svg {...base}>
    <circle cx="12" cy="12" r="8.5" fill={active ? "currentColor" : "none"} />
    <path d="M12 8.5v7M8.5 12h7" stroke={active ? "var(--tg-surface)" : "currentColor"} />
  </svg>;
}

/**
 * Лоток входящих. В v2 не иконка отдельной вкладки (инбокс стал строкой на
 * «Сегодня», раздел «Три отличия от макета» спецификации), а иконка
 * вкладки «Дневник» — список сохранённых приёмов пищи по дням — и самой
 * строки-ссылки на инбокс.
 */
export function IconInbox({ active }: IconProps) {
  return <svg {...base}>
    <path d="M4 13.5 6 5.5h12l2 8" />
    <path
      d="M4 13.5h4l1 2.5h6l1-2.5h4v4a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-4Z"
      fill={active ? "currentColor" : "none"}
    />
  </svg>;
}

/** Искра — подсказка, что съесть дальше. Используется на карточке «Сегодня», не в нижней панели. */
export function IconSuggest({ active }: IconProps) {
  return <svg {...base}>
    <path
      d="M12 3.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z"
      fill={active ? "currentColor" : "none"}
    />
    <path d="M18.5 16.5c.25 1.3.95 2 2.25 2.25-1.3.25-2 .95-2.25 2.25-.25-1.3-.95-2-2.25-2.25 1.3-.25 2-.95 2.25-2.25Z" />
  </svg>;
}

/** Флажок на шесте — цель плана, к которой идёт прогресс. */
export function IconPlan({ active }: IconProps) {
  return <svg {...base}>
    <path d="M6 20.5V4" />
    <path d="M6 5h11l-3 3.5L17 12H6Z" fill={active ? "currentColor" : "none"} />
  </svg>;
}

/** Силуэт человека — профиль и настройки. */
export function IconProfile({ active }: IconProps) {
  return <svg {...base}>
    <circle cx="12" cy="8.5" r="3.5" fill={active ? "currentColor" : "none"} />
    <path d="M5 19.5c1.1-3.7 3.9-5.6 7-5.6s5.9 1.9 7 5.6" fill={active ? "currentColor" : "none"} />
  </svg>;
}

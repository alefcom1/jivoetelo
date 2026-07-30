// Иллюстрации пустых экранов. Тоже свои, тоже вектор — по тем же причинам,
// что и значки в app/tg/food-icon.tsx: сток стоит денег и лицензии, а весит
// больше, чем весь остальной интерфейс.
//
// Приём один на все четыре: мягкое цветное пятно на фоне и штриховой рисунок
// поверх. Пятно даёт цвет и объём, штрих — узнаваемость. Цвета берутся
// переменными темы, поэтому в тёмной схеме картинка не белеет пятном.

const stroke = {
  fill: "none",
  stroke: "var(--tg-text)",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return <svg className="tg-illustration" viewBox="0 0 128 128" role="img" aria-label={label}>
    {children}
  </svg>;
}

/** Пустая тарелка с приборами — «записей ещё нет». */
export function ArtEmptyPlate() {
  return <Frame label="Пустая тарелка">
    <circle cx="64" cy="64" r="44" fill="var(--brand-lime)" />
    <circle cx="66" cy="66" r="27" {...stroke} fill="var(--tg-surface)" />
    <circle cx="66" cy="66" r="17" {...stroke} strokeWidth="1.6" opacity="0.5" />
    <path d="M24 44v14a5 5 0 0 0 5 5h1v25" {...stroke} />
    <path d="M27 44v14M32 44v14" {...stroke} strokeWidth="1.6" opacity="0.55" />
    <path d="M104 44c-4 0-7 5-7 12s3 10 7 10v22" {...stroke} />
    <circle cx="88" cy="40" r="4" fill="var(--brand-coral)" />
  </Frame>;
}

/** Камера над тарелкой — «снимите блюдо». */
export function ArtCamera() {
  return <Frame label="Камера">
    <circle cx="64" cy="64" r="44" fill="var(--brand-lime)" />
    <rect x="24" y="44" width="80" height="54" rx="12" {...stroke} fill="var(--tg-surface)" />
    <path d="M48 44l5-9a4 4 0 0 1 3.4-2h15.2a4 4 0 0 1 3.4 2l5 9" {...stroke} fill="var(--tg-surface)" />
    <circle cx="64" cy="71" r="17" {...stroke} fill="var(--brand-coral)" />
    <circle cx="64" cy="71" r="8" {...stroke} fill="var(--tg-surface)" strokeWidth="1.6" />
    <circle cx="90" cy="56" r="3.4" fill="var(--tg-text)" />
  </Frame>;
}

/** Стопка снимков — «инбокс пуст». */
export function ArtPhotos() {
  return <Frame label="Снимки">
    <circle cx="64" cy="64" r="44" fill="var(--brand-lime)" />
    <rect x="26" y="46" width="56" height="46" rx="8" {...stroke} fill="var(--tg-surface)"
      transform="rotate(-9 54 69)" />
    <rect x="44" y="38" width="58" height="48" rx="8" {...stroke} fill="var(--tg-surface)"
      transform="rotate(7 73 62)" />
    <g transform="rotate(7 73 62)">
      <circle cx="60" cy="53" r="5" fill="var(--brand-coral)" />
      <path d="M48 78l14-15 10 10 8-7 12 12" {...stroke} strokeWidth="2" />
    </g>
  </Frame>;
}

/** Три точки и пунктир — «данных пока мало, тренд появится». */
export function ArtTrend() {
  return <Frame label="График">
    <circle cx="64" cy="64" r="44" fill="var(--brand-lime)" />
    <path d="M28 96h72" {...stroke} strokeWidth="1.8" opacity="0.5" />
    <path d="M32 82l18-10 18 6" {...stroke} />
    <path d="M68 78l14-8 18-16" {...stroke} strokeDasharray="2 7" opacity="0.55" />
    <circle cx="32" cy="82" r="5" fill="var(--brand-coral)" />
    <circle cx="50" cy="72" r="5" fill="var(--brand-coral)" />
    <circle cx="68" cy="78" r="5" fill="var(--brand-coral)" />
    <circle cx="100" cy="54" r="5" {...stroke} fill="var(--tg-surface)" strokeWidth="2" />
  </Frame>;
}

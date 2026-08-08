// Иллюстрации раздела /pro. Тот же приём, что в app/tg/illustrations.tsx и
// app/tg/food-icon.tsx: инлайновый SVG, одна толщина штриха на весь набор,
// палитра только переменными темы. Здесь эти картинки не украшают пустой
// экран, а иллюстрируют конкретные правила из lib/pro/access.ts — поэтому
// каждая сцена держится близко к тексту рядом с ней и не обещает того, чего
// в правилах нет (лечения, диагнозов, чужих интеграций).
//
// ЛОВУШКА: `stroke` ниже задаёт fill:none спредом. Если поверх спреда нужна
// заливка, `fill=` пишем ПОСЛЕ {...stroke} в JSX — иначе spread перебьёт её
// обратно в none.
const stroke = {
  fill: "none",
  stroke: "var(--black)",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const sans = { fontFamily: "var(--sans)" } as const;

/** Общая обвязка: viewBox, роль и подпись для скринридера. */
function Art({
  viewBox,
  label,
  className,
  children,
}: {
  viewBox: string;
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <svg className={className} viewBox={viewBox} role="img" aria-label={label} focusable="false">
      {children}
    </svg>
  );
}

/** Пунктирная стрелка между узлами схемы — сама схема не толще смысла, который она показывает. */
function Arrow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <g>
      <path d={`M${x1} ${y} L${x2 - 8} ${y}`} stroke="var(--line)" strokeWidth={1.6} strokeLinecap="round" strokeDasharray="1.5 7" />
      <path d={`M${x2 - 9} ${y - 4.5} L${x2} ${y} L${x2 - 9} ${y + 4.5}`} {...stroke} stroke="var(--line)" />
    </g>
  );
}

/**
 * Схема «Как устроен доступ» в четыре шага: специалист называет код клиенту,
 * клиент отмечает, что показать, и открывается доступ на чтение. Порядок
 * узлов и подписи — прямое отражение шагов из .pro-access-steps рядом, не
 * отдельная история.
 */
export function ArtAccessFlow() {
  const xs = [64, 248, 432, 616];
  const cy = 58;
  const r = 32;
  const labels = ["Специалист", "Код", "Клиент отмечает", "Чтение открыто"];

  return (
    <Art
      className="pro-art pro-art-flow"
      viewBox="0 0 680 150"
      label="Схема доступа: специалист сообщает код, клиент отмечает, какие данные показать, после чего открывается доступ только на чтение"
    >
      {xs.slice(0, -1).map((x, i) => (
        <Arrow key={x} x1={x + r + 6} x2={xs[i + 1] - r - 6} y={cy} />
      ))}

      {/* Узел 1 — специалист: силуэт бюста. */}
      <g>
        <circle cx={xs[0]} cy={cy} r={r} fill="var(--paper)" stroke="var(--line)" strokeWidth={1} />
        <circle cx={xs[0]} cy={cy - 7} r={8} {...stroke} />
        <path d={`M${xs[0] - 16} ${cy + 18} C${xs[0] - 16} ${cy + 8} ${xs[0] - 9} ${cy + 3} ${xs[0]} ${cy + 3} C${xs[0] + 9} ${cy + 3} ${xs[0] + 16} ${cy + 8} ${xs[0] + 16} ${cy + 18}`} {...stroke} />
      </g>

      {/* Узел 2 — код из восьми знаков: восемь чёрточек в рамке вместо цифр. */}
      <g>
        <circle cx={xs[1]} cy={cy} r={r} fill="var(--paper)" stroke="var(--line)" strokeWidth={1} />
        <rect x={xs[1] - 26} y={cy - 12} width={52} height={24} rx={5} {...stroke} fill="var(--white)" strokeWidth={1.2} />
        {[-21, -15, -9, -3, 3, 9, 15, 21].map((dx) => (
          <line key={dx} x1={xs[1] + dx} x2={xs[1] + dx} y1={cy - 6} y2={cy + 6} stroke="var(--black)" strokeWidth={1.6} strokeLinecap="round" />
        ))}
      </g>

      {/* Узел 3 — клиент отмечает: три строки, две галочки, одна пустая. Объём дробный. */}
      <g>
        <circle cx={xs[2]} cy={cy} r={r} fill="var(--paper)" stroke="var(--line)" strokeWidth={1} />
        {[cy - 16, cy - 1, cy + 14].map((y, i) => (
          <g key={y}>
            <rect x={xs[2] - 12} y={y} width={10} height={10} rx={2} fill="var(--white)" stroke="var(--black)" strokeWidth={1.4} />
            {i !== 1 && (
              <path d={`M${xs[2] - 10.5} ${y + 5.2} l2 2.3 l4 -5`} fill="none" stroke="var(--coral)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
            )}
            <rect x={xs[2] + 3} y={y + 3} width={16} height={2.6} rx={1.3} fill="var(--line)" />
          </g>
        ))}
      </g>

      {/* Узел 4 — открывается чтение: глаз, зрачок акцентного цвета. */}
      <g>
        <circle cx={xs[3]} cy={cy} r={r} fill="var(--paper)" stroke="var(--line)" strokeWidth={1} />
        <path d={`M${xs[3] - 18} ${cy} Q${xs[3]} ${cy - 13} ${xs[3] + 18} ${cy} Q${xs[3]} ${cy + 13} ${xs[3] - 18} ${cy} Z`} {...stroke} fill="var(--white)" />
        <circle cx={xs[3]} cy={cy} r={5} {...stroke} fill="var(--white)" />
        <circle cx={xs[3]} cy={cy} r={1.8} fill="var(--coral)" />
      </g>

      {xs.map((x, i) => (
        <text key={x} x={x} y={cy + r + 22} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--black)" style={sans}>
          {labels[i]}
        </text>
      ))}
    </Art>
  );
}

type GlyphName = "form" | "pill" | "talk";

const GLYPHS: Record<GlyphName, React.ReactNode> = {
  // Перечёркнутый бланк — «не ставим диагнозы»: документ с текстовыми
  // строками и диагональной чертой поверх. Черта акцентного цвета, чтобы
  // прочитывалась как единственный смысловой штрих на значке.
  form: (
    <>
      <rect x={5} y={3} width={14} height={18} rx={1.5} {...stroke} />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="var(--black)" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M4 4L20 20" stroke="var(--coral)" strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  // Перечёркнутая пилюля — «не назначаем лечение»: капсула с той же
  // диагональной чертой, что и у бланка, — один приём на оба «нет».
  pill: (
    <>
      <rect x={4} y={9.5} width={16} height={7} rx={3.5} {...stroke} transform="rotate(-28 12 13)" />
      <line x1={12} y1={9.5} x2={12} y2={16.5} transform="rotate(-28 12 13)" stroke="var(--black)" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M4 4L20 20" stroke="var(--coral)" strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  // Силуэт разговора двоих — «не заменяем консультацию»: не перечёркнуто,
  // потому что мысль обратная — это то, что остаётся человеку.
  talk: (
    <>
      <circle cx={8} cy={9} r={3.2} {...stroke} />
      <path d="M3 20c.7-3.6 2.7-5.4 5-5.4s4.3 1.8 5 5.4" {...stroke} />
      <circle cx={17} cy={10} r={2.7} {...stroke} />
      <path d="M12.4 20c.6-3 2.2-4.4 4.1-4.4.9 0 1.7.3 2.4.9" {...stroke} />
    </>
  ),
};

const GLYPH_LABELS: Record<GlyphName, string> = {
  form: "Перечёркнутый бланк — сервис не ставит диагнозы",
  pill: "Перечёркнутая пилюля — сервис не назначает лечение",
  talk: "Двое разговаривают — сервис не заменяет консультацию",
};

/**
 * Значок 24×24 для блока «Чего мы не делаем», один компонент на три штуки —
 * та же схема, что у FoodIcon в app/tg/food-icon.tsx. Стоит перед заголовком
 * .pro-honest-item, где текст уже всё объясняет словами, поэтому сам значок
 * декоративный и скрыт от скринридера.
 */
export function ProGlyph({ name }: { name: GlyphName }) {
  return (
    <svg className="pro-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <title>{GLYPH_LABELS[name]}</title>
      {GLYPHS[name]}
    </svg>
  );
}

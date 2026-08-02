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

function Frame({ children, label, className = "tg-illustration" }: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return <svg className={className} viewBox="0 0 128 128" role="img" aria-label={label}>
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

// ── Живело ───────────────────────────────────────────────────────────────
//
// Енот на главном экране. Почему енот, а не привычная сова: сова у Duolingo
// смотрит на тебя и требует, а её взгляд стал мемом про давление. Наш
// персонаж должен делать обратное — брать пропуск на себя (см. lib/mascot.ts),
// и енот для этого подходит телосложением: он круглый, слегка помятый и
// заведомо не образец дисциплины.
//
// Пять состояний отличаются только лицом и одной деталью рядом. Тело, уши и
// маска общие: узнаваемость персонажа держится на силуэте, и если менять его
// от настроения к настроению, каждый раз будет новый зверь.

export type RaccoonMood = "happy" | "calm" | "frozen" | "missed" | "asleep";

/**
 * Хвост в кольцах. Рисуется одним контуром трижды: обводка, светлая заливка и
 * та же линия пунктиром поверх — пунктир и даёт кольца. Так они всегда лежат
 * поперёк хвоста и не разъезжаются, как разъехались бы отдельные штрихи.
 */
function RaccoonTail() {
  const path = "M90 76q25 9 21 27-4 15-17 17";
  return <g fill="none" strokeLinecap="round">
    <path d={path} stroke="var(--tg-text)" strokeWidth="18" />
    <path d={path} stroke="var(--tg-surface)" strokeWidth="14" />
    <path d={path} stroke="var(--tg-text)" strokeWidth="14" strokeDasharray="8 10" strokeLinecap="butt" />
  </g>;
}

/**
 * Ухо — треугольник со скруглённой вершиной. Круглые уши читаются как панда:
 * первая версия персонажа именно пандой и выглядела, и лечится это формой уха,
 * а не всем остальным.
 *
 * `droop` наклоняет ухо наружу. Опущенные уши — самый быстрый способ показать
 * настроение: их видно даже там, где картинка размером с ноготь и выражение
 * глаз уже не разобрать.
 */
function RaccoonEar({ side, droop }: { side: -1 | 1; droop: number }) {
  const x = 64 + side * 24;
  return <g transform={`rotate(${side * droop} ${x} 42)`}>
    <path
      d={`M${x + side * 11} 41 Q${x + side * 9} 22 ${x} 19 Q${x - side * 9} 23 ${x - side * 11} 41 Z`}
      {...stroke}
      fill="var(--tg-surface)"
    />
    <path d={`M${x + side * 6} 38 Q${x + side * 5} 27 ${x} 25 Q${x - side * 5} 28 ${x - side * 6} 38 Z`}
      fill="var(--brand-coral)" />
  </g>;
}

/**
 * Маска — то, по чему енот узнаётся раньше, чем разглядят морду. Форма важнее,
 * чем кажется: два круглых пятна дают панду, а енота даёт широкая полоса,
 * оставляющая светлым и край морды, и просвет посередине — ту самую полоску,
 * которая у настоящего енота идёт от носа ко лбу.
 *
 * Крыло нарисовано один раз и отражено: так половины гарантированно
 * симметричны, а править форму приходится в одном месте.
 */
function RaccoonMask() {
  const wing = "M38 54Q47 47 58 50Q62 54 61 61Q60 68 55 70Q45 74 39 70Q34 65 38 54Z";
  return <g fill="var(--tg-text)" opacity="0.85">
    <path d={wing} />
    <path d={wing} transform="translate(128 0) scale(-1 1)" />
  </g>;
}

/** Глаз с бликом — открытая форма, общая для спокойного и грустного лица. */
function RaccoonEye({ side, pupilY }: { side: -1 | 1; pupilY: number }) {
  const x = 64 + side * 17;
  return <>
    <circle cx={x} cy="58" r="7" fill="var(--tg-surface)" />
    <circle cx={x} cy={pupilY} r="3.6" fill="var(--tg-text)" />
    <circle cx={x - 1.3} cy={pupilY - 1.5} r="1.3" fill="var(--tg-surface)" />
  </>;
}

/** Насколько опущены уши в каждом состоянии. */
const EAR_DROOP: Record<RaccoonMood, number> = {
  happy: -5,
  calm: 0,
  frozen: 7,
  missed: 18,
  asleep: 24,
};

function RaccoonFace({ mood }: { mood: RaccoonMood }) {
  const line = { ...stroke, strokeWidth: 2.6 };
  // Веки рисуются светлым: они лежат на тёмной маске, и тёмная линия там
  // просто исчезнет.
  const lid = { ...line, stroke: "var(--tg-surface)" };

  switch (mood) {
    case "happy":
      return <>
        {/* Зажмуренные от радости глаза — дугой вверх. */}
        <path d="M40 61q7-9 14 0M74 61q7-9 14 0" {...lid} />
        <path d="M56 82q8 7 16 0" {...line} />
        <path d="M108 16l2.6 6.6L117 25l-6.4 2.4L108 34l-2.6-6.6L99 25l6.4-2.4z" fill="var(--brand-coral)" />
      </>;

    case "calm":
      return <>
        <RaccoonEye side={-1} pupilY={58} />
        <RaccoonEye side={1} pupilY={58} />
        <path d="M57 82q7 4 14 0" {...line} />
      </>;

    case "frozen":
      return <>
        {/* Полузакрытые глаза: не грустные и не радостные — переждать. */}
        <path d="M40 59q7-6 14 0M74 59q7-6 14 0" {...lid} />
        <path d="M57 83h14" {...line} />
        {/* Шарф — деталь, по которой состояние читается раньше текста. */}
        <path d="M40 92q24 11 48 0" {...stroke} strokeWidth="10" stroke="var(--brand-coral)" strokeLinecap="butt" />
        <g {...stroke} strokeWidth="2.4" opacity="0.6">
          <path d="M108 12v26M97 18l22 14M119 18l-22 14" />
        </g>
      </>;

    case "missed":
      return <>
        {/* Зрачки внизу и брови «домиком»: внутренние концы подняты.
            Опущенные внутрь означали бы злость, а не грусть — на первой
            версии енот выглядел рассерженным именно из-за этого. Слезы нет
            намеренно: она превращает пропуск дня в горе. */}
        <RaccoonEye side={-1} pupilY={61} />
        <RaccoonEye side={1} pupilY={61} />
        <path d="M38 45q8-6 15-3M90 45q-8-6-15-3" {...line} strokeWidth="3" />
        <path d="M57 85q7-5 14 0" {...line} />
      </>;

    case "asleep":
      return <>
        <path d="M40 57q7 8 14 0M74 57q7 8 14 0" {...lid} />
        <path d="M59 83q5 3 10 0" {...line} strokeWidth="2.2" />
        <g fill="var(--tg-text)" opacity="0.6" fontWeight="700">
          <text x="99" y="34" fontSize="19">z</text>
          <text x="111" y="17" fontSize="13">z</text>
        </g>
      </>;
  }
}

/**
 * Живело. `label` приходит снаружи (lib/mascot.ts, MOOD_LABELS), чтобы текст
 * для скринридера жил рядом с остальными репликами персонажа, а не двумя
 * наборами слов в разных файлах.
 */
export function ArtRaccoon({ mood, label }: { mood: RaccoonMood; label: string }) {
  return <Frame label={label} className="tg-mascot-art">
    <circle cx="64" cy="60" r="46" fill="var(--brand-lime)" />
    <RaccoonTail />
    {/* Тело выглядывает снизу — от него нужен только намёк на пухлость. */}
    <ellipse cx="64" cy="110" rx="27" ry="22" {...stroke} fill="var(--tg-surface)" />
    <RaccoonEar side={-1} droop={EAR_DROOP[mood]} />
    <RaccoonEar side={1} droop={EAR_DROOP[mood]} />
    <ellipse cx="64" cy="58" rx="31" ry="28" {...stroke} fill="var(--tg-surface)" />
    <RaccoonMask />
    {/* Морда: светлое пятно поверх маски, тёмный нос и складка под ним. */}
    <ellipse cx="64" cy="76" rx="15" ry="11" fill="var(--tg-surface)" />
    <path d="M57 68.5q7-5 14 0-3 7-7 7t-7-7z" fill="var(--tg-text)" />
    <RaccoonFace mood={mood} />
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

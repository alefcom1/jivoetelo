/**
 * Обложки статей, нарисованные кодом.
 *
 * Пока настоящих иллюстраций нет, обложку рисует SVG в палитре бренда:
 * бумага, чернила, коралл, лайм. Композиции абстрактные — по мотиву статьи,
 * без текста внутри картинки (текст рядом, в карточке). Когда придут
 * растровые иллюстрации (docs/blog-illustrations.md), поле `heroImage` в
 * lib/articles.ts переключит карточку и страницу на файл — компоненты
 * останутся запасным вариантом.
 *
 * Все SVG декоративные (aria-hidden): смысл несёт подпись карточки, а не
 * узор. viewBox 16:9, растягиваются на ширину контейнера.
 */

import Image from "next/image";

const PALETTE = {
  paper: "#f4f1ea",
  ink: "#171917",
  coral: "#e56d55",
  lime: "#d9e49c",
  line: "#d7d4ca",
  white: "#fffefa",
};

function Frame({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 800 450" aria-hidden preserveAspectRatio="xMidYMid slice">
    <rect width="800" height="450" fill={PALETTE.paper} />
    {children}
  </svg>;
}

/** Снимок тарелки превращается в состав: рамка кадра и строки списка. */
export function HeroPhoto() {
  return <Frame>
    <circle cx="300" cy="225" r="150" fill={PALETTE.white} stroke={PALETTE.line} strokeWidth="2" />
    <circle cx="300" cy="225" r="118" fill="none" stroke={PALETTE.line} strokeWidth="2" />
    <path d="M232 260 q40 -66 92 -40 q60 28 96 -18" fill="none" stroke={PALETTE.coral} strokeWidth="10" strokeLinecap="round" />
    <circle cx="262" cy="188" r="17" fill={PALETTE.lime} />
    <circle cx="352" cy="270" r="12" fill={PALETTE.ink} />
    {/* рамка видоискателя */}
    {[[150, 75, 1, 1], [450, 75, -1, 1], [150, 375, 1, -1], [450, 375, -1, -1]].map(([x, y, dx, dy], i) => (
      <path key={i} d={`M${x} ${Number(y) + Number(dy) * 34} v${-Number(dy) * 34} h${Number(dx) * 34}`}
        fill="none" stroke={PALETTE.ink} strokeWidth="7" strokeLinecap="round" />
    ))}
    {/* строки состава справа */}
    {[150, 205, 260, 315].map((y, i) => (
      <g key={y}>
        <circle cx="530" cy={y - 6} r="7" fill={i === 1 ? PALETTE.coral : PALETTE.ink} />
        <rect x="552" y={y - 12} width={i === 3 ? 90 : 150} height="13" rx="6.5" fill={PALETTE.ink} opacity={0.82 - i * 0.14} />
        <rect x="552" y={y + 8} width={i === 2 ? 60 : 96} height="9" rx="4.5" fill={PALETTE.line} />
      </g>
    ))}
  </Frame>;
}

/** Четыре колонки сравнения, одна — коралловая. */
export function HeroCompare() {
  const bars = [
    { x: 150, h: 180, fill: PALETTE.line },
    { x: 300, h: 235, fill: PALETTE.coral },
    { x: 450, h: 205, fill: PALETTE.lime },
    { x: 600, h: 150, fill: PALETTE.ink },
  ];
  return <Frame>
    <line x1="100" y1="370" x2="700" y2="370" stroke={PALETTE.ink} strokeWidth="3" />
    {bars.map((bar) => (
      <g key={bar.x}>
        <rect x={bar.x - 45} y={370 - bar.h} width="90" height={bar.h} fill={bar.fill} />
        <rect x={bar.x - 45} y={370 - bar.h} width="90" height={bar.h} fill="none" stroke={PALETTE.ink} strokeWidth="3" />
      </g>
    ))}
    <circle cx="300" cy="100" r="22" fill="none" stroke={PALETTE.coral} strokeWidth="6" />
    <path d="M290 100 l8 8 l14 -16" fill="none" stroke={PALETTE.coral} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  </Frame>;
}

/** Экран телефона со шторкой чата: дневник внутри мессенджера. */
export function HeroTelegram() {
  return <Frame>
    <rect x="300" y="55" width="200" height="360" rx="26" fill={PALETTE.white} stroke={PALETTE.ink} strokeWidth="5" />
    <rect x="318" y="96" width="164" height="46" rx="10" fill={PALETTE.lime} />
    <rect x="318" y="152" width="118" height="34" rx="10" fill={PALETTE.paper} stroke={PALETTE.line} strokeWidth="2" />
    <rect x="364" y="196" width="118" height="34" rx="10" fill={PALETTE.paper} stroke={PALETTE.line} strokeWidth="2" />
    <rect x="318" y="250" width="164" height="110" rx="12" fill={PALETTE.ink} />
    <circle cx="352" cy="284" r="14" fill={PALETTE.coral} />
    <rect x="376" y="272" width="88" height="10" rx="5" fill={PALETTE.white} opacity="0.9" />
    <rect x="376" y="290" width="60" height="8" rx="4" fill={PALETTE.white} opacity="0.55" />
    <rect x="334" y="322" width="132" height="20" rx="10" fill={PALETTE.coral} />
    {/* бумажный самолётик */}
    <path d="M120 150 l150 55 l-58 22 l-14 56 l-28 -64 z" fill={PALETTE.coral} stroke={PALETTE.ink} strokeWidth="5" strokeLinejoin="round" />
    <path d="M212 227 l58 -22" fill="none" stroke={PALETTE.ink} strokeWidth="5" />
    <path d="M560 300 q60 -20 90 -80" fill="none" stroke={PALETTE.line} strokeWidth="6" strokeDasharray="2 16" strokeLinecap="round" />
  </Frame>;
}

/** Диапазон против точки: широкая полоса и одинокая насечка. */
export function HeroRange() {
  return <Frame>
    <line x1="120" y1="180" x2="680" y2="180" stroke={PALETTE.line} strokeWidth="4" />
    <line x1="400" y1="158" x2="400" y2="202" stroke={PALETTE.ink} strokeWidth="8" strokeLinecap="round" />
    <line x1="120" y1="300" x2="680" y2="300" stroke={PALETTE.line} strokeWidth="4" />
    <rect x="250" y="272" width="300" height="56" rx="28" fill={PALETTE.coral} opacity="0.9" />
    <rect x="250" y="272" width="300" height="56" rx="28" fill="none" stroke={PALETTE.ink} strokeWidth="4" />
    <circle cx="330" cy="300" r="9" fill={PALETTE.white} />
    <circle cx="400" cy="300" r="9" fill={PALETTE.white} opacity="0.7" />
    <circle cx="470" cy="300" r="9" fill={PALETTE.white} opacity="0.4" />
    <path d="M395 120 l5 -9 l5 9 z" fill={PALETTE.ink} />
  </Frame>;
}

/** Шумные точки веса, сглаженный тренд и линия плана, идущая ступенькой. */
export function HeroAdaptive() {
  const points = [
    [140, 205], [185, 190], [230, 214], [275, 187], [320, 200], [365, 176],
    [410, 190], [455, 168], [500, 182], [545, 158], [590, 172], [635, 150],
  ];
  return <Frame>
    <line x1="110" y1="360" x2="690" y2="360" stroke={PALETTE.ink} strokeWidth="3" />
    <path d="M140 202 C 260 200, 420 185, 635 158" fill="none" stroke={PALETTE.coral} strokeWidth="8" strokeLinecap="round" />
    {points.map(([x, y]) => <circle key={x} cx={x} cy={y} r="7" fill={PALETTE.ink} opacity="0.55" />)}
    <path d="M140 300 H 390 V 322 H 635" fill="none" stroke={PALETTE.lime} strokeWidth="10" strokeLinecap="round" />
    <circle cx="390" cy="311" r="13" fill={PALETTE.white} stroke={PALETTE.ink} strokeWidth="4" />
  </Frame>;
}

/** Три одинаковые тарелки, под каждой — своя лента чисел разной длины. */
export function HeroMismatch() {
  const plates = [190, 400, 610];
  const bars = [130, 210, 165];
  return <Frame>
    {plates.map((cx, i) => <g key={cx}>
      <circle cx={cx} cy={165} r={62} fill={PALETTE.white} stroke={PALETTE.ink} strokeWidth="4" />
      <circle cx={cx} cy={165} r={40} fill="none" stroke={PALETTE.line} strokeWidth="3" />
      <rect x={cx - bars[i] / 2} y={278} width={bars[i]} height="22" rx="11"
        fill={i === 1 ? PALETTE.coral : PALETTE.lime} stroke={PALETTE.ink} strokeWidth="3" />
    </g>)}
    <path d="M190 227 V 278 M400 227 V 278 M610 227 V 278" stroke={PALETTE.line} strokeWidth="3" strokeDasharray="2 10" />
  </Frame>;
}

export const HEROES: Record<string, () => React.ReactElement> = {
  "kak-ustroen-dnevnik-po-foto": HeroPhoto,
  "sravnenie-prilozhenij-dlya-podscheta-kalorij": HeroCompare,
  "dnevnik-pitaniya-v-telegram": HeroTelegram,
  "pochemu-diapazon-chestnee-tochnogo-chisla": HeroRange,
  "norma-kalorij-kotoraya-uchitsya": HeroAdaptive,
  "pochemu-u-odnogo-blyuda-v-raznyh-prilozheniyah-raznaya-kalor": HeroMismatch,
};

/**
 * Обложка статьи. `card` — для мест, где картинка показывается мелко:
 * карточки журнала на главной и в сетке хаба. Там подставляется версия
 * 800 px (scripts/blog-heroes.mjs готовит обе), иначе ради картинки в
 * 300 CSS-пикселей грузился бы файл на 1600.
 *
 * Пустой `alt` — сознательно: во всех местах, где обложка декоративна,
 * контейнер помечен `aria-hidden`, а смысл несёт заголовок рядом. На
 * странице самой статьи alt приходит настоящий.
 */
export function ArticleHero({
  slug,
  image,
  alt,
  card = false,
}: {
  slug: string;
  image: string | null;
  alt: string;
  card?: boolean;
}) {
  if (image) {
    const src = card ? image.replace(/\.webp$/, "-card.webp") : image;
    return <Image
      src={src}
      alt={alt}
      width={card ? 800 : 1600}
      height={card ? 450 : 900}
      sizes={card ? "(max-width: 850px) 100vw, 560px" : "(max-width: 850px) 100vw, 1120px"}
    />;
  }
  const Hero = HEROES[slug];
  return Hero ? <Hero /> : null;
}

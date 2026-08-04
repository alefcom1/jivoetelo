# Заглавные иллюстрации статей журнала

**Статус: сделаны.** Пять иллюстраций получены от владельца 4 августа 2026,
лежат в `public/blog/hero-<slug>.webp` (1600 px) и `-card.webp` (800 px).
SVG-обложки в `app/blog/heroes.tsx` остаются запасным вариантом: они
включаются сами, если у статьи в реестре нет `heroImage`.

## Как добавить иллюстрацию к новой статье

1. Положить исходный PNG в отдельный каталог.
2. Вписать его в `MAP` в `scripts/blog-heroes.mjs` (файл → слаг) и собрать:
   `node scripts/blog-heroes.mjs <каталог-с-исходниками>`.
   Скрипт сделает обе версии: 1600 px для обложки статьи и хаба, 800 px —
   для карточек, где картинка показывается мелко.
3. В `lib/articles.ts` заполнить `heroImage: "/blog/hero-<slug>.webp"` и
   `heroAlt` — описанием того, что на картинке видно на самом деле.
4. `npm test` проверит, что оба файла на месте и описание не пустое.

Обложка идёт и в OpenGraph, поэтому **на картинке не должно быть текста** —
заголовок в превью и так подставляется рядом.

## Промпты, по которым сделаны нынешние обложки

## Общий стиль (добавлять к каждому промпту)

> Editorial illustration, flat graphic style with subtle paper texture.
> Warm palette: cream paper background (#f4f1ea), near-black ink (#171917),
> coral accent (#e56d55), soft lime (#d9e49c). Clean composition, generous
> negative space, no text, no letters, no logos. Aspect ratio 16:9.

## Промпты

| Файл | Статья | Промпт (к нему — общий стиль выше) |
| --- | --- | --- |
| `hero-foto.webp` | Как устроен дневник по фото | A smartphone held above a ceramic plate of food (grain bowl with vegetables), viewfinder frame corners visible; from the plate, thin ink lines flow out into a tidy list of dots and bars, like food turning into structured data. Top-down view, calm and precise. |
| `hero-sravnenie.webp` | Честное сравнение приложений | Four simple bar columns on a paper background, one coral and clearly taller but NOT touching the top edge; a small honest checkmark circle beside the coral bar; the other bars in ink, lime and grey each with one visible advantage notch. Balanced, non-boastful mood. |
| `hero-telegram.webp` | Дневник питания в Telegram | A paper plane flying toward a smartphone screen that shows an abstract food-diary card (ring chart and bars, no text); dotted flight path in ink; the phone slightly tilted, floating on cream background. Light, quick, friendly. |
| `hero-diapazon.webp` | Почему диапазон честнее | A wide coral rounded band (a range) on a ruler-like scale, with a single thin ink tick mark standing alone above it; a plate of borscht subtly echoed in the corner. The contrast between one thin line and one wide honest band is the hero. |
| `hero-norma.webp` | Норма, которая учится | A scatter of small ink dots (noisy daily weight) with one smooth coral trend line flowing through them; below, a lime plan-line stepping down once like a staircase; a small scale (weighing device) silhouette in the corner. Calm, scientific but warm. |

## Когда пришлёте файлы

Пришлите пять файлов — я сам положу их в `public/blog/`, пропишу
`heroImage` в реестре, проверю вес/размеры и перевыложу. Если какая-то
иллюстрация не понравится — SVG-обложка остаётся, меняем не все сразу.

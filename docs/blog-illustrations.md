# Заглавные иллюстрации статей журнала

Сейчас обложки рисует код: SVG-композиции в палитре бренда
(app/blog/heroes.tsx). Они пригодные, но настоящая иллюстрация лучше.
Ниже — промпты для генерации, по одному на статью.

## Как подключить готовые иллюстрации

1. Файл положить в `public/blog/` под именем из таблицы (webp, ширина
   1600 px, пропорция 16:9; сжать до ~150–250 КБ).
2. В `lib/articles.ts` у статьи заполнить `heroImage: "/blog/hero-….webp"`.
3. `npm test` проверит, что файл существует; SVG-обложка автоматически
   станет запасным вариантом.

Обложка попадает и в OpenGraph статьи, поэтому важно: **без текста на
картинке** — заголовок рядом с ней и так есть, а текст в OG-превью
дублировался бы с подписью Telegram/VK.

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

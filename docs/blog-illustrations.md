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

## Промпты для статьи «ИИ считает калории по фото»

Статья большая и держится на трёх поворотах: «жир не виден в кадре»,
«бесплатно не бывает» и «важна не точность, а регулярность». Обложка обязана
взять первый — он и есть главное открытие для читателя; остальные два
рассказывают графики внутри (`MacroErrorChart`, `CostBarChart`).

Ниже четыре промпта: один на обложку и три на врезки внутрь текста. К каждому
добавлять общий стиль из раздела выше. Врезки — не 16:9: они стоят в колонке
текста, и широкий кадр там оставляет полоски пустоты.

### 1. Обложка (обязательная) — `hero-ii-podschet-kalorij-po-foto.webp`

> A smartphone camera viewfinder framing a plate of fried cutlet with
> buckwheat and salad, seen from directly above. Ghosted, semi-transparent
> ink outlines rise from the plate showing what the camera cannot see: a
> spoonful of oil soaking into the cutlet, a hidden swirl of dressing inside
> the salad — drawn as faint dotted contours with question-mark-free
> emptiness around them. The visible food is solid and confident; the hidden
> fat is barely-there dotted line. Coral accent only on the hidden parts.
> Aspect ratio 16:9.

Идея кадра: видимое нарисовано уверенно, невидимое — пунктиром. Это и есть
тезис статьи одним изображением, без единой буквы.

### 2. Врезка «три шага разбора» — `ii-tri-shaga.webp`

> Three connected panels in a horizontal row on cream paper: (1) a plate with
> food, (2) the same plate with a measuring caliper and a ruler arc over one
> portion, (3) a tidy stack of three horizontal bars of different lengths.
> Thin ink arrows between panels. Flat, diagrammatic, no text. Aspect ratio
> 3:1.

Ставить после раздела «Как это устроено внутри».

### 3. Врезка «когда ИИ не нужен» — `ii-kogda-ne-nuzhen.webp`

> Three small objects arranged with generous spacing on cream paper: a
> product package with a barcode, a calendar page with one day circled in
> coral, and a small kitchen scale with a bowl. Each drawn simply, in ink
> with one coral accent. No phone, no camera in the frame. Aspect ratio 3:2.

Кадр намеренно без телефона: раздел про то, что фотографировать не надо.

### 4. Врезка «за что платят вместо денег» — `ii-chem-platyat.webp`

> Four small icons in a two-by-two grid on cream paper, drawn in flat ink
> with coral accents: a counter dial stopped at a low number (a hard limit),
> a rectangular banner shape (advertising), a stack of anonymous silhouette
> cards (data), and an hourglass (a trial period). Equal weight, none
> villainous — a neutral taxonomy, not an accusation. Aspect ratio 1:1.

Тон важен: это классификация, а не обличение. Четыре способа зарабатывать
одинаково законны, и картинка не должна делать из них злодеев.

### Чего на этих картинках быть не должно

- **Букв и цифр.** Обложка идёт в OpenGraph, заголовок подставляется рядом.
- **Реальных логотипов приложений.** В статье они названы словами; рисовать
  чужие знаки на своей иллюстрации — чужая интеллектуальная собственность.
- **Роботов, мозгов из микросхем и синего свечения.** Статья спорит с
  рекламной подачей «магического ИИ» — и обложка не должна её повторять.
- **Тел, весов с человеком, «до и после».** Правило журнала: мы про еду и
  цифры, не про внешний вид.

## Промпт для статьи «Как считать калории самостоятельно»

Статья держится на одном тезисе: **ошибка распределена неравномерно, и
взвешивать надо только плотное и маленькое**. Обложка обязана взять именно
его — не «подсчёт калорий» вообще, иначе получится стоковая картинка про
диету, каких в выдаче тысячи.

Ход, который делает это без единой буквы: **на весах лежит крошечное, а
огромное стоит рядом мимо весов**. Зрительный парадокс («почему взвешивают
ложку, а не миску?») и есть вопрос, ответ на который даёт статья.

### Обложка — `hero-kak-schitat-kalorii.webp`

> Editorial illustration, flat graphic style with subtle paper texture. Warm
> palette: cream paper background (#f4f1ea), near-black ink (#171917), coral
> accent (#e56d55), soft lime (#d9e49c). Clean composition, generous negative
> space, no text, no letters, no numbers, no logos. Aspect ratio 16:9.
>
> A kitchen counter seen from a low three-quarter angle. On the left, a small
> flat digital kitchen scale with a tiny object on its platform: a single
> tablespoon holding a bead of golden oil, drawn small and precise, rendered
> with the most detail in the whole image. The scale's display panel is drawn
> as a blank dark rounded rectangle with no digits on it. A soft coral glow
> outlines the spoon, marking it as the thing that matters.
>
> On the right, occupying twice the visual area, a large wide bowl heaped with
> leafy salad, cucumber rounds and herbs — drawn in loose soft lime and ink
> strokes, deliberately less detailed, standing directly on the counter beside
> the scale, clearly NOT being weighed. A comfortable gap of empty cream
> counter separates them.
>
> The size relationship is the subject: the tiny item is measured, the huge
> one is not. Calm, matter-of-fact kitchen mood, warm daylight from the left,
> soft long shadows on the counter. No hands, no people.

### Что здесь важно и почему

- **Дисплей весов пустой.** Обложка идёт в OpenGraph, и любая цифра на ней
  станет обещанием точности — ровно тем, против чего написана статья. По той
  же причине ни одной буквы.
- **Разная степень проработки — часть смысла.** Ложка выписана детально,
  салат нарисован размашисто. Это визуальный перевод правила: точность нужна
  там, где она стоит килокалорий, и не нужна там, где не стоит.
- **Масштаб обязан читаться сразу.** Если миска и ложка окажутся сопоставимы
  по площади кадра, парадокс исчезнет и останется просто натюрморт. Миска
  должна занимать заметно больше места — примерно вдвое.
- **Коралловый — только на ложке.** Один акцент на весь кадр; он и говорит,
  куда смотреть.
- **Без рук и людей.** Правило журнала: мы про еду и числа, не про внешний
  вид и не про «правильный образ жизни».

### Запасной вариант, если первый выйдет вялым

Тот же тезис через ряд, а не через пару. Сработает, если генератор не
удержит разницу масштабов:

> Five objects in a single horizontal row on cream paper, sharply decreasing
> in physical size from right to left but INCREASING in drawn precision: a
> loose bushel of leafy greens, a whole cucumber, a wedge of cheese, a small
> handful of walnuts, and finally a single tablespoon of oil. The three items
> on the right are sketchy and pale; the two on the left are crisp, detailed
> and outlined in coral. A thin ink baseline runs under all five. Flat,
> diagrammatic, no text, no numbers. Aspect ratio 16:9.

Тут смысл читается как шкала: чем меньше и плотнее предмет, тем внимательнее
он нарисован.

### Чего на этой обложке быть не должно

- **Цифр на дисплее весов, ярлыков, любых надписей.** Это первое, что
  генератор захочет добавить, и это придётся отдельно запрещать в промпте.
- **Сантиметровой ленты, напольных весов, тел, талий, «до и после».**
  Статья про арифметику еды, а не про внешний вид.
- **Калькулятора, блокнота с расчётами, телефона с приложением.** Соблазн
  показать «подсчёт» буквально — и картинка сразу становится стоковой.
- **Тарелки, поделённой на секторы.** Это чужой метод (тарелочный), и он
  предмет другой статьи кластера — «Похудеть без подсчёта калорий».

# Заглавные иллюстрации статей журнала

## Что было не так с прежней редакцией

Этот документ переписан 8 августа 2026 целиком, и переписан по делу.

В нём лежала таблица промптов, описывавших **плоскую векторную графику**:
«four bar columns on a paper background», «flat diagrammatic, no text»,
«three connected panels». По такому промпту получается четыре столбика на
бежевом фоне — примитивная схема, которую невозможно ни разглядывать, ни
захотеть.

Настоящие обложки, заказанные владельцем 4 августа, выглядят совершенно
иначе: тёплая фотография, живой человек, красивая еда, свет из окна. То есть
**документ описывал не тот стиль, в котором сделан журнал**, и два новых
набора промптов были дописаны в том же ошибочном направлении.

Корень ошибки стоит назвать, чтобы он не вернулся: промпты писались для
**схемы**, а нужны **обложки**. Это разная работа.

| | Схема | Обложка |
|---|---|---|
| Работа | объяснить механизм | остановить взгляд, вызвать аппетит |
| Где живёт | внутри статьи | над заголовком, в карточке, в OpenGraph |
| Чем делается | SVG в `app/blog/charts.tsx` | фотореалистичная иллюстрация |

**Схемы у нас уже есть, и они хорошие** — `MacroErrorChart`,
`ErrorShareChart`, `DishRangeChart` и остальные рисуются кодом по нашим же
данным. Обложка не должна их повторять: если она пересказывает график,
читатель дважды получает одно и то же, причём первый раз — хуже.

## Общий стиль

Снят с готовых картинок, а не придуман. Добавлять к каждому промпту.

> Photorealistic editorial lifestyle photography, warm and inviting. Golden
> hour sunlight streaming through a large window from the side, soft haze and
> gentle lens bloom, warm highlights. Bright airy kitchen: light walls,
> natural wood table, open shelves with ceramics, many lush green potted
> plants. Shallow depth of field, creamy bokeh in the background. Rich but
> natural colour, appetising food styling, fine texture on every surface.
> No text, no letters, no numbers, no logos, no user interface labels.
> Aspect ratio 16:9.

### Повторяющийся мир — держать

У журнала уже сложился узнаваемый мир, и это ценность, которую легко
потерять по невнимательности. Его надо держать во всех новых обложках:

**Героиня.** Женщина лет тридцати пяти, тёмные вьющиеся волосы, собранные в
мягкий небрежный пучок, светлая льняная рубашка песочного оттенка поверх
белого топа, спокойное тёплое выражение лица. Не модель на съёмке — человек
у себя дома.

> A woman in her mid-thirties with dark curly hair gathered in a loose bun,
> wearing a soft sand-coloured linen shirt over a white top, calm warm
> expression, natural relaxed posture.

**Кухня.** Светлая, живая, обжитая: деревянный стол, зелень в горшках,
корзинка с фруктами, стакан воды с лимоном, льняная салфетка, изредка
блокнот и телефон.

**Еда.** Всегда настоящая и аппетитная: боул с курицей, нутом, киноа или
булгуром, брокколи, черри, зелень — на светлой керамике. Еда занимает
передний план и должна выглядеть так, чтобы её захотелось.

**Фирменный световой слой.** Единственный графический элемент, который себе
позволяем: тонкая тёплая светящаяся линия или парящие светлые частицы поверх
фотографии. Мягко, деликатно, никогда не главным героем.

> A delicate glowing warm-white light line and a few floating luminous
> particles drift over the scene, soft and subtle, never dominating.

## Вторая партия — промпты и что по ним вышло

**Сделаны 8 августа 2026, лежат в репозитории.** Первая партия, заказанная по
переписанным промптам, — и она подтвердила, в чём была ошибка: те же пять
статей, тот же список тем, а результат несопоставим с плоскими схемами.

После неё **обложек нет ни у одной статьи журнала** — все двенадцать со
своими картинками, запасные SVG больше нигде не показываются.

Промпты сохранены дословно: по ним делать варианты и добирать похожее.

### 1. «Как считать калории самостоятельно» — `hero-kak-schitat-kalorii.webp`

Тезис: взвешивать надо крошечное и плотное, а огромное можно на глаз.

> The woman stands at her kitchen counter, looking down with a small amused
> smile at a small slim digital kitchen scale in front of her. On the scale sits
> something very small: a spoon with a bead of golden olive oil, a few
> walnuts and a thin slice of cheese, lit warmly and rendered in exquisite
> detail, glistening. Right beside the scale, taking up much more of the
> frame, stands a big generous bowl of bright leafy salad with cucumber and
> cherry tomatoes — beautiful, abundant, and clearly not being weighed. Warm
> side light, wooden counter, plants behind her.

Что критично: **крошечное — на весах, огромное — мимо**. Если миска и ложка
окажутся одного размера, смысл пропадёт. И никаких цифр на дисплее весов:
обложка идёт в OpenGraph, а цифра там станет обещанием точности.

### 2. «ИИ считает калории по фото» — `hero-ii-podschet-kalorij-po-foto.webp`

Тезис: жира не видно на снимке.

Сцена намеренно **не дома** — «Как устроен дневник по фото» уже занял
домашнюю съёмку тарелки, и вторая такая же обложка сольётся с первой.

> The woman sits at a table by the window in a cosy sunlit cafe, holding her
> phone above a beautiful plate of grilled chicken with couscous and roasted
> vegetables, about to take a photo. Warm afternoon light. A few luminous
> particles rise from the plate — but near the chicken a soft golden shimmer
> of oil glistens on the surface, half-dissolved into the food, almost
> invisible, catching just a glint of light. Café interior softly blurred
> behind her, wooden table, a glass of water.

Главное — блик масла: он должен быть заметен глазу, но не выделен. В этом
весь тезис статьи.

### 3. «Почему у одного блюда разная калорийность» — `hero-pochemu-u-odnogo-blyuda-v-raznyh-prilozheniyah-raznaya-kalor.webp`

Тезис: одно блюдо, три разных ответа.

> The woman sits at her kitchen table with a single beautiful plate of
> buckwheat with chicken in front of her, resting her chin on her hand with a
> slightly puzzled, curious expression. Around the plate, fanned out like
> playing cards, float three translucent glowing panels of warm white light,
> each with a different soft halo size — clearly three different answers
> about the same dish. Golden window light, plants, a glass of water with
> lemon nearby.

Панели пустые и светящиеся — без цифр и без интерфейса. Разницу несёт размер
ореола, а не текст.

### 4. «Гречка: 92 или 330 ккал» — `hero-grechka-92-ili-330-kkal-kak-odno-chislo-lomaet-polovinu-pods.webp`

Тезис: одна и та же крупа, два разных объёма.

> On a sunlit wooden table, two ceramic bowls stand side by side: a small
> bowl holding a modest handful of dry raw buckwheat grains, and next to it a
> much larger bowl heaped with fluffy steaming cooked buckwheat, glistening
> and appetising. The woman's hands are visible, one resting beside each
> bowl, as if presenting the comparison. Warm morning light from the window,
> a linen napkin, a wooden spoon, green plants softly blurred behind.

Здесь человек нужен только руками — сравнение объёмов должно занять кадр.
Разница в размере обязана быть очевидной, примерно втрое.

### 5. «Три килограмма, которые не жир» — `hero-tri-kilogramma-kotorye-ne-zhir-chto-pokazyvayut-vesy-na-samo.webp`

Тезис: скачок веса — это вода, а не жир.

> Early morning in a bright kitchen. The woman stands by the window in soft
> light, calmly pouring water from a glass carafe into a tall glass; a slice
> of lemon and fresh mint on the counter beside her. Condensation beads
> glisten on the carafe, and a few luminous droplets catch the sunlight in
> mid-air. Everything is unhurried and warm. Plants on the windowsill,
> wooden counter.

**Весов в кадре нет намеренно.** Статья про то, что весам не надо верить
буквально, и обложка со взвешиванием тянула бы ровно в обратную сторону — а
заодно к теме внешнего вида, которой в журнале не место.

## Иллюстрации внутри статей

Это отдельный жанр, и правила у него другие, чем у обложек.

**Зачем они нужны.** Восьмиминутный текст без пауз читают по диагонали.
У двух семиминутных статей журнала внутри по три-четыре фотографии, а у двух
самых длинных — только схемы и ни одного снимка. Это перекос, который видно
глазами: самые содержательные тексты выглядят самыми утомительными.

**Чем отличаются от обложек.**

| | Обложка | Фигура внутри |
|---|---|---|
| Кадр | сцена целиком, человек в полный рост за столом | еда крупно, человек — руками или поясным планом |
| Пропорции | строго 16:9, кадрируется скриптом | родные, скрипт только уменьшает до 1400 px |
| Человек | почти всегда | по обстоятельствам: половина фигур — чистая еда |
| Задача | остановить взгляд | дать отдохнуть глазу и показать то, о чём абзац |

**Еда здесь главная.** На обложке она часть сцены, а в фигуре — герой:
крупный план, ресторанная подача, тёплое дерево, боковой свет, пар, блеск
масла на корочке, зелень сверху. Ровно как в готовых `poryadok-edy.webp` и
`sobrannaya-tarelka.webp` — на них стоит посмотреть перед заказом.

К каждому промпту ниже добавлять общий стиль из раздела выше, но **без
строки про 16:9** — пропорции указаны у каждой фигуры своей.

### Для статьи «Как считать калории»

**1. `schitat-cena-lozhki` — после раздела «Правило плотности».** 3:2

Тезис абзаца: в ложке масла столько же энергии, сколько в целой миске
овощей. Показать это едой, а не цифрами.

> A warm wooden table, dramatic low side light. On the left, three tiny
> things arranged in a precise row, lit like jewellery: a spoon pooled with
> golden olive oil, a small heap of shelled walnuts, a thin shaving of
> parmesan. On the right, filling most of the frame, three generous ceramic
> bowls brimming with vegetables — roasted broccoli with charred edges,
> ripe cherry tomatoes, crisp cucumber and green leaves — glistening,
> beautifully plated, restaurant quality. The tiny row and the abundant
> bowls balance each other visually, as if weighing the same. Close-up food
> photography, deep shadows, no people. Aspect ratio 3:2.

**2. `schitat-kastryulya` — в разделе «Домашняя еда».** 4:3

> Close-up of a woman's hands ladling thick fragrant vegetable and chicken
> soup from a big enamel pot into a pale ceramic bowl, steam rising through
> a shaft of afternoon light. On the wooden table beside the pot: a board
> with chopped carrots and herbs, a wooden spoon, a linen towel. Rich
> colour, glossy broth, appetising and homely. Only hands and forearms in
> frame. Aspect ratio 4:3.

**3. `schitat-svoya-tarelka` — в разделе «Первая неделя».** 16:9

Тезис: запись занимает секунды и не мешает ужинать.

> Evening in a warm kitchen. The woman sits at a beautifully set wooden
> table with a gorgeous dinner in front of her — grilled fish, roasted
> vegetables, a bright side salad, a glass of water — softly lit by a low
> warm lamp. She is relaxed, mid-meal, holding her fork; her phone lies flat
> on the table beside her, screen down, forgotten. Calm, unhurried, the food
> is the brightest thing in the frame. Aspect ratio 16:9.

### Для статьи «ИИ считает калории по фото»

**1. `ii-razobrannaya-tarelka` — после «Как это устроено внутри».** 16:9

Тезис: разбор раскладывает блюдо на продукты. Показать буквально и красиво.

> Top-down view of a warm wooden table. On the left, one beautifully plated
> dish: grilled chicken with couscous, roasted peppers and greens, glossy
> and appetising. On the right, the very same meal taken apart into neat
> separate little piles and small bowls — sliced chicken, a mound of
> couscous, roasted peppers, fresh herbs, and a tiny dish of golden oil —
> arranged in a tidy grid with generous space between them. Rich colour,
> soft directional light, no people, no text. Aspect ratio 16:9.

**2. `ii-shtrihkod` — в разделе «Когда ИИ не нужен вовсе».** 4:3

Тезис: у упаковки состав уже напечатан, оценивать нечего.

> Close-up of a woman's hands holding a plain unbranded tub of Greek yoghurt
> over a wooden table, tilting it as if reading the side. On the table below:
> a stunning breakfast bowl of thick yoghurt topped with raspberries,
> blueberries, toasted nuts and a drizzle of honey, catching the morning
> light, plus a small jug of milk and a spoon. The packaging is completely
> blank — no labels, no lettering, no logos. Only hands in frame.
> Aspect ratio 4:3.

**3. `ii-nedelya-zavtrakov` — в разделе «Главное про точность».** 3:2

Тезис: регулярность важнее точности одного снимка.

> Top-down grid of seven breakfast bowls on a warm wooden surface, arranged
> in an even row of four and three. Each is the same kind of breakfast but
> slightly different day to day: porridge with berries, yoghurt with nuts,
> eggs with greens, cottage cheese with peaches — all beautifully styled,
> colourful and appetising, in matching pale ceramic. Soft even daylight,
> gentle shadows, a linen cloth at one corner. No people, no text.
> Aspect ratio 3:2.

### Когда файлы придут

1. Вписать имена в `FIGURES` в `scripts/blog-heroes.mjs` (там пропорции
   родные, кадрирования нет) и собрать.
2. Вставить `<figure className="blog-figure">` с подписью в нужные разделы
   статей — места указаны у каждого промпта.

Подпись под фигурой обязательна и пишется по делу, а не «иллюстрация к
разделу»: она читается вместе с текстом и должна добавлять мысль.

## Первая партия — сцены, записанные задним числом

Семь обложек от 4 и 7 августа. Промптов от них не осталось: прежняя таблица
описывала совсем другой стиль, и восстановить по ней эти картинки было
невозможно. Сцены сняты глазами с готовых файлов — нужны, если файл
потеряется или понадобится вариант.

| Файл | Статья | Сцена |
| --- | --- | --- |
| `hero-kak-ustroen-dnevnik-po-foto` | Как устроен дневник по фото | Героиня за кухонным столом снимает на телефон боул с курицей, нутом и киноа; из тарелки в воздух поднимается и кружит хоровод отдельных продуктов — брокколи, черри, батат, зелень — соединённый тонкими светящимися нитями. Контровой золотой свет из окна |
| `hero-sravnenie-prilozhenij-dlya-podscheta-kalorij` | Честное сравнение приложений | Героиня за столом смотрит на четыре телефона, разложенных в ряд; на экране каждого — своя тарелка еды, третий подсвечен тёплым коралловым ореолом. Чашка чая, блокнот, фрукты, зелень |
| `hero-dnevnik-pitaniya-v-telegram` | Дневник питания в Telegram | Героиня в светлом кафе держит два телефона: на одном камера, на другом переписка с карточкой её обеда. Перед ней большой яркий боул, стакан воды с лимоном; на заднем плане в расфокусе — другая посетительница у окна |
| `hero-pochemu-diapazon-chestnee-tochnogo-chisla` | Почему диапазон честнее | Три тарелки одного и того же блюда разного объёма стоят в ряд перед героиней; над ними течёт тонкая светящаяся линия с тремя точками-узлами. Она смотрит на них спокойно, подперев подбородок |
| `hero-norma-kalorij-kotoraya-uchitsya` | Норма, которая учится | Героиня за столом с боулом, блокнотом и телефоном; справа полупрозрачными силуэтами проступает её же день — тренировка, обед, взвешивание, — соединённый плавной светящейся линией. Напольные весы в углу кадра |
| `hero-kak-umenshit-skachki-sahara-posle-edy` | После обеда вырубает | Крупный план накрытого стола: тарелка с рыбой, нутом, киноа и брокколи, рука с вилкой, стакан янтарного напитка. Мягкий рассеянный свет, льняная скатерть, зелень и фрукты в глубине |
| `hero-myagkaya-disciplina-dlya-tela` | Мотивация кончается на третий день | Вид сверху на круглый деревянный стол: свёрнутый плед, кроссовки, скрученный коврик, стакан воды, тарелка с бататом, киноа и рукколой, блокнот с карандашом. Баночка добавок стоит сбоку, вне центра |

## Как добавить готовую иллюстрацию

1. Положить исходный PNG в отдельный каталог.
2. Вписать его в `MAP` в `scripts/blog-heroes.mjs` (файл → слаг) и собрать:
   `node scripts/blog-heroes.mjs <каталог-с-исходниками>`.
   Скрипт сделает обе версии: 1600 px для обложки статьи и хаба, 800 px —
   для карточек, где картинка показывается мелко.
3. В `lib/articles.ts` заполнить `heroImage: "/blog/hero-<slug>.webp"` и
   `heroAlt` — описанием того, что на картинке видно на самом деле.
4. `npm test` проверит, что оба файла на месте и описание не пустое.

Пришлите файлы — разложу, пропишу в реестре, проверю вес и перевыложу. Если
какая-то не понравится, SVG-обложка остаётся: она включается сама, когда у
статьи в реестре нет `heroImage`.

**Исходников в `MAP` копится больше, чем в любой отдельной партии**, а сами
PNG в репозиторий не кладутся — десять мегабайт против четырёхсот килобайт
результата. Поэтому скрипт пропускает ненайденные исходники и в конце
говорит, сколько взял и сколько не нашлось. Прежняя редакция падала на первом
же отсутствующем файле, не обработав ничего.

## Чего на обложках быть не должно

- **Плоской векторной графики, столбиков, инфографики, схем.** Именно этим
  была испорчена прежняя редакция документа. Схемы живут внутри статьи и
  рисуются кодом.
- **Букв и цифр.** Обложка идёт в OpenGraph, заголовок подставляется рядом.
  Отдельно следить за цифрами на дисплеях весов и экранах телефонов —
  генератор тянется их дорисовать.
- **Реальных логотипов приложений и узнаваемых интерфейсов.** Чужие знаки на
  своей картинке — чужая интеллектуальная собственность.
- **Роботов, мозгов из микросхем, синего неонового свечения.** Журнал спорит
  с рекламной подачей «магического ИИ», а не повторяет её.
- **Тел, талий, сантиметровых лент, «до и после», человека на весах.**
  Правило журнала: мы про еду и числа, а не про внешний вид.
- **Унылой «диетической» еды.** Лист салата на белой тарелке — антиреклама.
  Еда на обложке должна быть такой, чтобы её захотелось съесть.

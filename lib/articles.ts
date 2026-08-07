/**
 * Реестр статей журнала.
 *
 * Данные отдельно от разметки по той же причине, что и lib/site-nav.ts:
 * на статьи ссылаются четыре места — хаб /blog, карточки на главной,
 * sitemap и связки «Читайте также» внутри самих статей, — и когда состав
 * менялся бы в одном месте, а не в четырёх, ссылки не расходятся.
 *
 * Тексты статей — компоненты в app/blog/content/: им нужны скриншоты,
 * графики и таблицы, и в строку данных их не уложить.
 */

/** Источник, на который опирается статья: закон, методичка, оригинал формулы. */
export type Source = { title: string; url: string };

export type Article = {
  slug: string;
  /** Рубрика над заголовком: «Продукт», «Сравнение», «Методология»… */
  kicker: string;
  title: string;
  /** Короткое имя для карточек и «Читайте также», где полный заголовок тесен. */
  titleShort: string;
  /** Метаописание и подводка на карточке — до 160 символов, отвечает сама. */
  description: string;
  /** Первый абзац на самой странице: развёрнутее описания. */
  lead: string;
  /** Дата публикации, ГГГГ-ММ-ДД. Реальная, не маркетинговая. */
  published: string;
  /**
   * Дата последней содержательной правки. Отдельно от `published`, потому
   * что «обновлено» — сигнал и для читателя, и для поиска, и врать им
   * одинаково плохо: правка запятой датой обновления не считается.
   */
  updated: string;
  minutes: number;
  /**
   * Заглавная иллюстрация. Пока файла нет — обложку рисует SVG-компонент
   * (app/blog/heroes.tsx); когда иллюстрация появится в public/blog/,
   * достаточно вписать сюда путь. Промпты — в docs/blog-illustrations.md.
   */
  heroImage: string | null;
  heroAlt: string;
  /**
   * На чём стоит статья. Пустой список — честный ответ для текстов про наш
   * же интерфейс: там источник — сам продукт, и выдумывать ссылки на
   * исследования, чтобы выглядеть научнее, мы не будем.
   */
  sources: Source[];
  /**
   * Раскрытие интереса. Нужно там, где мы судим сами себя: сравнение с
   * конкурентами без такой пометки — реклама, притворяющаяся обзором.
   */
  disclosure?: string;
};

export const ARTICLES: Article[] = [
  {
    slug: "kak-umenshit-skachki-sahara-posle-edy",
    kicker: "Питание",
    title: "После обеда вырубает. Разбираемся, при чём тут сахар",
    titleShort: "После обеда вырубает",
    description:
      "Порядок еды, остывший рис, ложка уксуса — что из этого работает и насколько. С честными размерами исследований: в главных из них было по пятнадцать человек.",
    lead:
      "Три часа дня, обед позади — и как будто выключили свет. Причин может быть десяток, " +
      "и одна из них — то, как повёл себя сахар крови. Разбираем, что на это влияет и что " +
      "из популярных приёмов выдерживает проверку.",
    published: "2026-08-07",
    minutes: 7,
    updated: "2026-08-07",
    sources: [
      {
        title: "Atkinson F. S. et al. International tables of glycemic index and glycemic load values 2021",
        url: "https://pubmed.ncbi.nlm.nih.gov/34258626/",
      },
      {
        title: "Shukla A. P. et al. The impact of food order on postprandial glycaemic excursions in prediabetes (2019)",
        url: "https://dom-pubs.onlinelibrary.wiley.com/doi/abs/10.1111/dom.13503",
      },
      {
        title: "Kuwata H. et al. Postprandial responses differ by meal macronutrient ingestion sequence — PATTERN study (2019)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31053510/",
      },
      {
        title: "Shishehbor F. et al. Vinegar consumption can attenuate postprandial glucose and insulin responses (2017)",
        url: "https://pubmed.ncbi.nlm.nih.gov/28292654/",
      },
      {
        title: "Sonia S. et al. Effect of cooling of cooked white rice on resistant starch content and glycemic response (2015)",
        url: "https://pubmed.ncbi.nlm.nih.gov/26693746/",
      },
      {
        title: "Patterson M. A. et al. Chilled potatoes decrease postprandial glucose, insulin and GIP (2019)",
        url: "https://pubmed.ncbi.nlm.nih.gov/31484331/",
      },
    ],
    heroImage: "/blog/hero-kak-umenshit-skachki-sahara-posle-edy.webp",
    heroAlt:
      "Человек за обеденным столом собирается есть: тарелка с рыбой, нутом, киноа и овощами, рядом стакан воды",
  },
  {
    slug: "myagkaya-disciplina-dlya-tela",
    kicker: "Привычки",
    title: "Мотивация кончается на третий день. Что работает вместо неё",
    titleShort: "Мотивация кончается на третий день",
    description:
      "Сила воли зависит от сна, погоды и настроения — фундамент так себе. Откуда взялся миф про 21 день, что делать после сорванного дня и с чего начать сегодня.",
    lead:
      "Абонемент куплен, коврик развёрнут, в заметках план на месяц. К среде всё это лежит " +
      "под кроватью, и появляется знакомая мысль: «у меня просто нет силы воли». Мысль " +
      "неверная — неудачно выбран фундамент.",
    published: "2026-08-07",
    minutes: 7,
    updated: "2026-08-07",
    sources: [
      {
        title: "Lally P. et al. How are habits formed: Modelling habit formation in the real world (2010)",
        url: "https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674",
      },
      {
        title: "Gardner B., Lally P., Wardle J. Making health habitual (BJGP, 2012)",
        url: "https://bjgp.org/content/62/605/664",
      },
      {
        title: "Lin H. et al. Making Specific Plan Improves Physical Activity and Healthy Eating (2022)",
        url: "https://pubmed.ncbi.nlm.nih.gov/35664117/",
      },
    ],
    heroImage: "/blog/hero-myagkaya-disciplina-dlya-tela.webp",
    heroAlt:
      "Вид сверху на стол: свёрнутый плед, кроссовки, коврик, стакан воды, тарелка с крупой и овощами, блокнот, а баночка добавок стоит сбоку",
  },
  {
    slug: "kak-ustroen-dnevnik-po-foto",
    kicker: "Продукт",
    title: "Как устроен дневник по фото: от снимка тарелки до состава",
    titleShort: "Как устроен дневник по фото",
    description:
      "Сфотографируйте тарелку — сервис разберёт её на продукты, покажет калорийность и честно скажет, где не уверен. Весь путь снимка внутри «Живого Тела», со скриншотами.",
    lead:
      "Самый частый вопрос о «Живом Теле» — «что происходит после того, как я сфотографировал еду?». " +
      "Показываем весь путь: от снимка до строчки в дневнике — где сервис уверен, где переспросит " +
      "и почему на каждом шаге можно всё поправить руками.",
    published: "2026-08-04",
    minutes: 3,
    updated: "2026-08-04",
    sources: [],
    heroImage: "/blog/hero-kak-ustroen-dnevnik-po-foto.webp",
    heroAlt:
      "Женщина за кухонным столом фотографирует на телефон тарелку с курицей, нутом и крупой; над тарелкой еда разлетается на отдельные продукты",
  },
  {
    slug: "sravnenie-prilozhenij-dlya-podscheta-kalorij",
    kicker: "Сравнение",
    title: "Приложения для подсчёта калорий — 2026: честное сравнение",
    titleShort: "Честное сравнение приложений",
    description:
      "Сравнили «Живое Тело» с FatSecret, YAZIO и Lifesum по десяти признакам. Где мы сильнее, где пока проигрываем — без маркетинговых таблиц, где автор выигрывает всё.",
    lead:
      "Сравнительные таблицы на сайтах приложений устроены одинаково: автор выигрывает во всех строках. " +
      "Мы сравнили себя с тремя сильными конкурентами по десяти признакам и честно отметили клетки, " +
      "где пока проигрываем, — их три, и мы объясняем почему.",
    published: "2026-08-04",
    minutes: 3,
    updated: "2026-08-04",
    sources: [],
    disclosure:
      "«Живое Тело» — наш продукт, и признаки для сравнения выбирали мы. " +
      "Данные о чужих приложениях собраны по их открытым описаниям и нашей проверке " +
      "на начало августа 2026 года; функции меняются, и мы просим сообщать об устаревшем.",
    heroImage: "/blog/hero-sravnenie-prilozhenij-dlya-podscheta-kalorij.webp",
    heroAlt:
      "Четыре телефона в ряд на деревянном столе, у каждого на экране своя тарелка; один экран подсвечен коралловым",
  },
  {
    slug: "dnevnik-pitaniya-v-telegram",
    kicker: "Mini App",
    title: "Дневник питания в Telegram — без установки приложения",
    titleShort: "Дневник питания в Telegram",
    description:
      "Полный дневник питания внутри Telegram: камера, разбор по фото, дневник и план — без установки, регистрации по номеру и второго приложения на телефоне.",
    lead:
      "Еду фотографируют там же, где едят, — с телефона. Поэтому главная версия «Живого Тела» живёт " +
      "не в App Store, а в Telegram: открывается из чата с ботом за секунду, ничего не устанавливает " +
      "и работает на любом телефоне, где есть сам Telegram.",
    published: "2026-08-04",
    minutes: 2,
    updated: "2026-08-04",
    sources: [
      { title: "Telegram Mini Apps — документация платформы", url: "https://core.telegram.org/bots/webapps" },
    ],
    heroImage: "/blog/hero-dnevnik-pitaniya-v-telegram.webp",
    heroAlt:
      "Женщина за обедом держит телефон с открытым чатом мессенджера, в переписке — фотография её тарелки",
  },
  {
    slug: "pochemu-diapazon-chestnee-tochnogo-chisla",
    kicker: "Методология",
    title: "Почему диапазон честнее точного числа",
    titleShort: "Почему диапазон честнее",
    description:
      "«В борще 58 ккал» — звучит убедительно, но это среднее по чужой кастрюле. Объясняем, откуда в подсчёте калорий берётся погрешность и почему честный сервис показывает диапазон.",
    lead:
      "Таблицы калорийности отвечают на любой вопрос одним числом с точностью до единицы. Это удобно " +
      "и неправда: у одного и того же блюда разброс в разы. Рассказываем, где именно теряется точность — " +
      "и почему показывать этот разброс полезнее, чем прятать.",
    published: "2026-08-04",
    minutes: 3,
    updated: "2026-08-04",
    sources: [
      { title: "МР 2.3.1.0253-21. Нормы физиологических потребностей в энергии и пищевых веществах", url: "https://www.rospotrebnadzor.ru/documents/details.php?ELEMENT_ID=18979" },
      { title: "FAO. Food energy — methods of analysis and conversion factors (коэффициенты Этуотера)", url: "https://www.fao.org/4/y5022e/y5022e00.htm" },
    ],
    heroImage: "/blog/hero-pochemu-diapazon-chestnee-tochnogo-chisla.webp",
    heroAlt:
      "Три тарелки одного блюда разного объёма стоят в ряд, над ними тянется светящаяся линия с тремя точками",
  },
  {
    slug: "norma-kalorij-kotoraya-uchitsya",
    kicker: "Методология",
    title: "Норма калорий, которая учится у вашего тела",
    titleShort: "Норма, которая учится",
    description:
      "Любая формула нормы калорий ошибается на сотни ккал — она считает среднего человека вашего роста. Показываем, как «Живое Тело» уточняет норму по тренду вашего веса.",
    lead:
      "Формула Миффлина — Сан-Жеора даёт разумную стартовую точку, но она рассчитана на среднего " +
      "человека вашего пола, роста и возраста. Вы — не средний человек. Поэтому через пару недель " +
      "записей сервис перестаёт верить формуле и начинает верить вашим данным.",
    published: "2026-08-04",
    minutes: 2,
    updated: "2026-08-04",
    sources: [
      { title: "Mifflin M. D. et al. A new predictive equation for resting energy expenditure in healthy individuals (1990)", url: "https://pubmed.ncbi.nlm.nih.gov/2305711/" },
      { title: "МР 2.3.1.0253-21. Нормы физиологических потребностей в энергии и пищевых веществах", url: "https://www.rospotrebnadzor.ru/documents/details.php?ELEMENT_ID=18979" },
    ],
    heroImage: "/blog/hero-norma-kalorij-kotoraya-uchitsya.webp",
    heroAlt:
      "Женщина за столом с тарелкой; рядом полупрозрачные силуэты её же дня — тренировка, обед, взвешивание, — соединённые плавной светящейся линией",
  },
  {
    slug: "pochemu-u-odnogo-blyuda-v-raznyh-prilozheniyah-raznaya-kalor",
    kicker: "Разбор",
    title: "Почему у одного блюда в разных приложениях разная калорийность",
    titleShort: "Разная калорийность в приложениях",
    description:
      "Разбираем, почему калькуляторы калорий расходятся в разы на одно и то же блюдо: дело не в погрешности измерения, а в разных базах за одинаковым названием.",
    lead:
      "Три счётчика калорий на одно и то же блюдо часто дают три разных числа, и разница — не в единицах, " +
      "а в разы. Показываем на своих же данных — гречке и плове, — почему это не ошибка измерения: за " +
      "одинаковым названием в разных приложениях обычно стоят разные записи в разных базах.",
    published: "2026-08-05",
    minutes: 4,
    updated: "2026-08-05",
    sources: [
      { title: "FAO. Food energy — methods of analysis and conversion factors (коэффициенты Этуотера)", url: "https://www.fao.org/4/y5022e/y5022e00.htm" },
      { title: "USDA FoodData Central — открытая база пищевой ценности продуктов", url: "https://fdc.nal.usda.gov/" },
    ],
    heroImage: null,
    heroAlt:
      "Три одинаковые тарелки в ряд, над каждой — своя лента с числами разной длины, ленты не совпадают",
  },
  {
    slug: "grechka-92-ili-330-kkal-kak-odno-chislo-lomaet-polovinu-pods",
    kicker: "Продукт",
    title: "Гречка: 92 или 330 ккал — как одно число ломает половину подсчётов",
    titleShort: "Гречка: 92 или 330 ккал",
    description:
      "92 ккал или 330 — гречка отвечает по-разному в зависимости от того, сухая она или уже сварена. " +
      "Показываем, почему расчёт калорий из-за этого часто ошибается втрое.",
    lead:
      "Одна и та же гречка встречается в интернете с калорийностью 92 и 330 ккал на 100 г — разница " +
      "почти вчетверо. Это не расхождение таблиц, а разговор о разных состояниях одного продукта: " +
      "сухой крупе и уже сваренной каше. Показываем математику разбухания и то, почему из-за путаницы " +
      "половина домашних расчётов ошибается ровно втрое.",
    published: "2026-08-05",
    minutes: 4,
    updated: "2026-08-05",
    sources: [],
    heroImage: null,
    heroAlt:
      "Маленький плотный кружок крупы соединён стрелкой с большим бледным кругом каши того же цвета",
  },
  {
    slug: "tri-kilogramma-kotorye-ne-zhir-chto-pokazyvayut-vesy-na-samo",
    kicker: "Разбор",
    title: "Три килограмма, которые не жир: что показывают весы на самом деле",
    titleShort: "Три килограмма, которые не жир",
    description:
      "Вес скачет на два-три килограмма за пару дней — и это не жир: разбираем, сколько в скачке гликогена с водой, содержимого кишечника и задержанного натрия.",
    lead:
      "Весы во вторник и весы в четверг иногда расходятся на три килограмма, и первый порыв — " +
      "поверить цифре. Энергетическая арифметика этого не позволяет: столько жира не может " +
      "исчезнуть или появиться за двое суток. Разбираем, из чего на самом деле складывается " +
      "такой скачок и как отличить его от настоящего изменения.",
    published: "2026-08-07",
    minutes: 4,
    updated: "2026-08-07",
    sources: [],
    heroImage: null,
    heroAlt:
      "Напольные весы с двумя разными числами на дисплее, между ними — прозрачные капли воды вместо гирь",
  },
];

/** Три статьи для витрины на главной — в порядке приоритета. */
export const FEATURED_SLUGS = [
  "kak-ustroen-dnevnik-po-foto",
  "sravnenie-prilozhenij-dlya-podscheta-kalorij",
  "dnevnik-pitaniya-v-telegram",
] as const;

export function findArticle(slug: string): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}

export function featuredArticles(): Article[] {
  return FEATURED_SLUGS.map((slug) => findArticle(slug)).filter((a): a is Article => Boolean(a));
}

/**
 * Самые свежие статьи — для короткой полосы в конце главной.
 *
 * Сортируем по дате, а не берём начало массива: порядок в `ARTICLES`
 * редакционный (им же задаётся пара крупных карточек на хабе), и однажды
 * кто-нибудь переставит статьи местами, не подозревая, что этим меняет и
 * «последние» на главной. Сортировка в JS устойчивая, поэтому при равных
 * датах порядок остаётся редакционным — то есть ровно тем, что и ожидается.
 */
export function latestArticles(count: number): Article[] {
  return [...ARTICLES].sort((a, b) => b.published.localeCompare(a.published)).slice(0, count);
}

/** «4 августа 2026» — дата в подписи карточки и статьи. */
export function formatArticleDate(published: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${published}T12:00:00Z`));
}

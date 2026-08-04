// Устойчивый идентификатор блюда: «Овсяная каша на молоке» и «Овсянка с
// молоком» должны быть одним объектом, а не двумя.
//
// ## Зачем
//
// Названия позиций приходят от разбора снимка свободным текстом
// (lib/ai/schema.ts), и одна и та же тарелка называется каждый раз по-новому.
// Для «как обычно?» из этого уже вышли обходом — см. комментарий к
// repeatableMeals в lib/frequent-meals.ts, там это описано как случившийся
// провал. Для любой статистики по блюдам обойти нельзя: без устойчивого ключа
// у каждого блюда будет n = 1, и считать станет нечего.
//
// ## Почему словарь, а не похожесть строк
//
// Там же, в frequent-meals.ts, записано, почему смягчать сравнение названий —
// плохой путь: «куриная грудка» и «куриный бульон» разойдутся по любому порогу
// похожести не там, где надо, и сделают это молча. Поэтому здесь не мера
// близости, а закрытый список блюд с основами слов — тот же приём, что в
// lib/food-category.ts, только мельче: там 18 категорий, здесь ~140 блюд.
//
// ## Два уровня, и ключ есть всегда
//
// Совпало с блюдом — `dish:ovsyanka`. Не совпало — `cat:cereal`, категория из
// lib/food-category.ts. Второй уровень грубее, но он не отсутствует никогда, и
// это важнее точности: анализ должен идти на самом мелком уровне, где хватает
// наблюдений, и честно подписывать, на каком именно. Префикс не даёт уровням
// перепутаться при подсчёте.
//
// Модуль чистый и работает без AI: при `AI_PROVIDER=off` он такой же, как при
// включённом. Разрешение непонятых имён моделью — отдельный слой поверх
// (словарь dish_aliases), и он лишь пополняет кэш, а не заменяет эти правила.

import { foodCategory, foodCategoryInfo, type FoodCategory } from "./food-category.ts";

/**
 * Слаг блюда → основы слов, по которым оно узнаётся, и подпись для отчётов.
 *
 * `generic` помечает родовое название — «каша», «суп», «салат», «рыба». Оно
 * проигрывает конкретному при равном счёте, и в этом весь смысл пометки:
 * «овсяная каша» — это овсянка, а не каша вообще, независимо от того, в каком
 * порядке стоят слова («каша овсяная» — то же блюдо).
 */
type DishEntry = { slug: string; label: string; stems: string[]; generic?: true };

/**
 * Закрытый список блюд массового рациона.
 *
 * Закрытый — принципиально: слаг, придуманный на ходу (моделью или из самого
 * названия), сведёт задачу обратно к свободному тексту. Список пополняется
 * правкой этого файла, и каждое пополнение видно в истории.
 *
 * Основы — без окончаний, сравнение идёт по началу слова. Порядок внутри
 * записи не важен: при разборе все основы сортируются по длине, и побеждает
 * самая длинная (см. matchDish).
 */
const DISHES: DishEntry[] = [
  // Крупы и каши
  { slug: "ovsyanka", label: "Овсянка", stems: ["овсян", "овсянк", "геркулес"] },
  { slug: "grechka", label: "Гречка", stems: ["гречк", "гречнев", "греча"] },
  { slug: "ris", label: "Рис", stems: ["рис", "рисов"] },
  { slug: "perlovka", label: "Перловка", stems: ["перловк", "перлов"] },
  { slug: "bulgur", label: "Булгур", stems: ["булгур"] },
  { slug: "kuskus", label: "Кускус", stems: ["кускус", "кус-кус"] },
  { slug: "manka", label: "Манная каша", stems: ["манк", "манн"] },
  { slug: "pshenka", label: "Пшённая каша", stems: ["пшенк", "пшенн", "пшен"] },
  { slug: "kinoa", label: "Киноа", stems: ["киноа", "кинва"] },
  { slug: "kasha", label: "Каша", stems: ["каша", "каши", "кашу"], generic: true },
  { slug: "granola", label: "Гранола и мюсли", stems: ["гранол", "мюсл", "хлопь"] },
  { slug: "makarony", label: "Макароны", stems: ["макарон", "паста", "спагетт", "лапш", "вермишел", "феттучин", "пенне"] },

  // Хлеб и выпечка несладкая
  { slug: "hleb", label: "Хлеб", stems: ["хлеб", "батон", "буханк"] },
  { slug: "lavash", label: "Лаваш", stems: ["лаваш", "тортиль", "шаверм-лаваш"] },
  { slug: "tost", label: "Тост", stems: ["тост", "гренк"] },
  { slug: "buterbrod", label: "Бутерброд", stems: ["бутерброд", "сэндвич", "сандвич"] },
  { slug: "bulochka", label: "Булочка", stems: ["булочк", "булк", "круассан", "кроассан"] },

  // Мясо и птица
  { slug: "kurinaya-grudka", label: "Куриная грудка", stems: ["грудк"] },
  { slug: "kurica", label: "Курица", stems: ["куриц", "курин", "цыплен", "окорочк", "крылышк", "бедр"] },
  { slug: "indeyka", label: "Индейка", stems: ["индейк", "индюш"] },
  { slug: "govyadina", label: "Говядина", stems: ["говядин", "телятин"] },
  { slug: "svinina", label: "Свинина", stems: ["свинин", "буженин", "карбонад"] },
  { slug: "kotleta", label: "Котлета", stems: ["котлет", "тефтел", "биточк", "шницел", "бифштекс", "фрикадел"] },
  { slug: "farsh", label: "Фарш", stems: ["фарш"] },
  { slug: "steyk", label: "Стейк", stems: ["стейк", "отбивн", "антрекот"] },
  { slug: "shashlyk", label: "Шашлык", stems: ["шашлык", "люля", "кебаб"] },
  { slug: "pelmeni", label: "Пельмени", stems: ["пельмен", "манты", "хинкал", "равиол"] },
  { slug: "golubcy", label: "Голубцы", stems: ["голубц", "долм"] },
  { slug: "kolbasa", label: "Колбаса", stems: ["колбас", "салями", "ветчин", "сервелат"] },
  { slug: "sosiski", label: "Сосиски", stems: ["сосиск", "сардельк"] },
  { slug: "bekon", label: "Бекон", stems: ["бекон", "грудинк", "сало"] },
  { slug: "pechen", label: "Печень", stems: ["печень", "печени", "печенк", "паштет", "субпродукт", "ливер"] },

  // Рыба и морепродукты
  { slug: "losos", label: "Лосось", stems: ["лосос", "семг", "форел", "горбуш"] },
  { slug: "tunec", label: "Тунец", stems: ["тунец", "тунц"] },
  { slug: "belaya-ryba", label: "Белая рыба", stems: ["треск", "минтай", "хек", "судак", "камбал", "палтус", "пикш"] },
  { slug: "seld", label: "Селёдка", stems: ["сельд", "селедк", "селёдк", "скумбр", "килька", "шпрот", "сардин"] },
  { slug: "krevetki", label: "Креветки", stems: ["креветк", "кальмар", "мидии", "краб", "морепродукт", "осьминог"] },
  { slug: "sushi", label: "Суши и роллы", stems: ["суши", "ролл", "сашими", "поке"] },
  { slug: "ikra", label: "Икра", stems: ["икра", "икру", "икры"] },
  { slug: "ryba", label: "Рыба", stems: ["рыба", "рыбу", "рыбы", "рыбн"], generic: true },

  // Яйца
  { slug: "yayca", label: "Яйца", stems: ["яйц", "яиц", "яичн"] },
  { slug: "omlet", label: "Омлет", stems: ["омлет", "скрэмбл", "скрембл"] },
  { slug: "glazunya", label: "Яичница", stems: ["глазунь", "яичниц", "пашот"] },

  // Молочное
  { slug: "tvorog", label: "Творог", stems: ["творог", "творож"] },
  { slug: "syrniki", label: "Сырники", stems: ["сырник"] },
  { slug: "syr", label: "Сыр", stems: ["сыр", "брынз", "моцарелл", "фета", "маскарпон", "рикотт", "чиз", "пармезан"] },
  { slug: "yogurt", label: "Йогурт", stems: ["йогурт", "греческ"] },
  { slug: "kefir", label: "Кефир", stems: ["кефир", "ряженк", "простокваш", "айран", "снежок"] },
  { slug: "smetana", label: "Сметана", stems: ["сметан"] },
  { slug: "moloko", label: "Молоко", stems: ["молок", "молочн", "сливк"] },
  { slug: "syrok", label: "Глазированный сырок", stems: ["сырок", "сырк"] },

  // Овощи
  { slug: "kartofel", label: "Картофель", stems: ["картофел", "картошк", "картоф"] },
  { slug: "kartofel-fri", label: "Картофель фри", stems: ["фри"] },
  { slug: "pyure", label: "Пюре", stems: ["пюре"] },
  { slug: "ogurec", label: "Огурцы", stems: ["огурц", "огурец", "огуреч"] },
  { slug: "pomidor", label: "Помидоры", stems: ["помидор", "томат", "черри"] },
  { slug: "kapusta", label: "Капуста", stems: ["капуст", "брокколи", "броккол", "цветн"] },
  { slug: "morkov", label: "Морковь", stems: ["морков"] },
  { slug: "svekla", label: "Свёкла", stems: ["свекл", "свёкл"] },
  { slug: "kabachok", label: "Кабачки", stems: ["кабачк", "кабачок", "баклажан", "цуккин"] },
  { slug: "perec", label: "Перец", stems: ["перец", "перц", "болгарск"] },
  { slug: "zelen", label: "Зелень и салат", stems: ["зелен", "укроп", "петрушк", "рукол", "шпинат", "листов", "латук", "айсберг"] },
  { slug: "griby", label: "Грибы", stems: ["гриб", "шампиньон", "вешенк", "опят", "лисичк"] },
  { slug: "avokado", label: "Авокадо", stems: ["авокадо"] },
  { slug: "kukuruza", label: "Кукуруза", stems: ["кукуруз"] },
  { slug: "ovoshi", label: "Овощи", stems: ["овощ", "овощн"], generic: true },

  // Супы
  { slug: "borsh", label: "Борщ", stems: ["борщ"] },
  { slug: "shchi", label: "Щи", stems: ["щи", "щей"] },
  { slug: "solyanka", label: "Солянка", stems: ["солянк"] },
  { slug: "uha", label: "Уха", stems: ["уха", "ухи"] },
  { slug: "kharcho", label: "Харчо", stems: ["харчо", "лагман", "шурп"] },
  { slug: "okroshka", label: "Окрошка", stems: ["окрошк", "свекольник"] },
  { slug: "sup", label: "Суп", stems: ["суп", "бульон", "крем-суп"], generic: true },

  // Салаты и закуски
  { slug: "olivye", label: "Оливье", stems: ["оливье"] },
  { slug: "shuba", label: "Селёдка под шубой", stems: ["шуб"] },
  { slug: "cezar", label: "Цезарь", stems: ["цезар"] },
  { slug: "vinegret", label: "Винегрет", stems: ["винегрет"] },
  { slug: "salat", label: "Салат", stems: ["салат"], generic: true },

  // Готовые блюда
  { slug: "plov", label: "Плов", stems: ["плов"] },
  { slug: "ragu", label: "Рагу", stems: ["рагу", "гуляш", "жарк"] },
  { slug: "zapekanka", label: "Запеканка", stems: ["запеканк"] },
  { slug: "vareniki", label: "Вареники", stems: ["вареник"] },
  { slug: "bliny", label: "Блины", stems: ["блин", "оладь", "олади", "панкейк"] },
  { slug: "pirog", label: "Пирог", stems: ["пирог", "пирожк", "кулебяк", "хачапур", "самс", "чебурек", "беляш"] },

  // Бобовые и соя
  { slug: "fasol", label: "Фасоль", stems: ["фасол"] },
  { slug: "nut", label: "Нут", stems: ["нут", "нута"] },
  { slug: "chechevica", label: "Чечевица", stems: ["чечевиц"] },
  { slug: "goroh", label: "Горох", stems: ["горох", "горошек", "горошк"] },
  { slug: "hummus", label: "Хумус", stems: ["хумус"] },
  { slug: "tofu", label: "Тофу", stems: ["тофу", "соев", "эдамам"] },

  // Орехи и семена
  { slug: "arahisovaya-pasta", label: "Арахисовая паста", stems: ["арахисов", "урбеч"] },
  { slug: "mindal", label: "Миндаль", stems: ["миндал"] },
  { slug: "arahis", label: "Арахис", stems: ["арахис"] },
  { slug: "greckiy-oreh", label: "Грецкий орех", stems: ["грецк"] },
  { slug: "oreh", label: "Орехи", stems: ["орех", "орешк", "кешью", "фундук", "фисташк", "пекан", "макадам"], generic: true },
  { slug: "semechki", label: "Семечки", stems: ["семечк", "семен", "кунжут", "чиа", "лен"] },

  // Фрукты и ягоды
  { slug: "yabloko", label: "Яблоко", stems: ["яблок", "яблоч"] },
  { slug: "banan", label: "Банан", stems: ["банан"] },
  { slug: "citrus", label: "Цитрусовые", stems: ["апельсин", "мандарин", "грейпфрут", "лимон", "лайм"] },
  { slug: "grusha", label: "Груша", stems: ["груш"] },
  { slug: "vinograd", label: "Виноград", stems: ["виноград"] },
  { slug: "yagody", label: "Ягоды", stems: ["ягод", "клубник", "малин", "черник", "вишн", "черешн", "смородин", "голубик", "ежевик"], generic: true },
  { slug: "arbuz", label: "Арбуз и дыня", stems: ["арбуз", "дын"] },
  { slug: "suhofrukty", label: "Сухофрукты", stems: ["сухофрукт", "изюм", "курага", "чернослив", "финик", "инжир"] },
  { slug: "frukty", label: "Фрукты", stems: ["фрукт", "персик", "абрикос", "слив", "ананас", "киви", "хурм", "гранат", "манго", "нектарин"], generic: true },

  // Сладкое
  { slug: "shokolad", label: "Шоколад", stems: ["шоколад", "шоколадн"] },
  { slug: "konfety", label: "Конфеты", stems: ["конфет", "ирис", "карамел", "трюфел"] },
  { slug: "pechenye", label: "Печенье", stems: ["печенье", "печенья", "печеньк", "крекер", "вафл", "пряник"] },
  { slug: "tort", label: "Торт и пирожное", stems: ["торт", "пирожн", "чизкейк", "эклер", "тирамису", "маффин", "кекс", "капкейк"] },
  { slug: "morozhenoe", label: "Мороженое", stems: ["мороженое", "мороженн", "пломбир", "эскимо"] },
  { slug: "med", label: "Мёд и варенье", stems: ["мед", "мёд", "варень", "джем", "повидл", "сгущен", "сгущён"] },
  { slug: "zefir", label: "Зефир и пастила", stems: ["зефир", "пастил", "мармелад", "халв"] },
  { slug: "batonchik", label: "Батончик", stems: ["батончик", "сникерс", "твикс", "марс"] },

  // Фастфуд
  { slug: "pizza", label: "Пицца", stems: ["пицц"] },
  { slug: "burger", label: "Бургер", stems: ["бургер", "гамбургер", "чизбургер"] },
  { slug: "shaurma", label: "Шаурма", stems: ["шаурм", "шаверм"] },
  { slug: "hot-dog", label: "Хот-дог", stems: ["хот-дог", "хотдог"] },
  { slug: "nagetsy", label: "Наггетсы", stems: ["наггетс", "нагетс", "стрипс"] },
  { slug: "chipsy", label: "Чипсы и снеки", stems: ["чипс", "сухарик", "попкорн", "снек", "начос"] },

  // Соусы и жиры
  { slug: "mayonez", label: "Майонез", stems: ["майонез"] },
  { slug: "kechup", label: "Кетчуп", stems: ["кетчуп", "томатн"] },
  { slug: "sous", label: "Соус", stems: ["соус", "горчиц", "аджик", "песто", "терияки", "заправк"], generic: true },
  { slug: "maslo-slivochnoe", label: "Сливочное масло", stems: ["сливочное"] },
  { slug: "maslo", label: "Масло", stems: ["масло", "оливков", "подсолнечн"], generic: true },

  // Напитки
  { slug: "kofe", label: "Кофе", stems: ["кофе", "капучин", "латте", "эспрессо", "americano", "американо", "раф"] },
  { slug: "chay", label: "Чай", stems: ["чай", "чая", "матч"] },
  { slug: "sok", label: "Сок", stems: ["сок", "фреш", "нектар"] },
  { slug: "gazirovka", label: "Газировка", stems: ["газиров", "кола", "лимонад", "спрайт", "фант", "energ", "энергетик"] },
  { slug: "kompot", label: "Компот и морс", stems: ["компот", "морс", "кисел"] },
  { slug: "smuzi", label: "Смузи", stems: ["смузи", "милкшейк", "коктейл"] },
  { slug: "protein", label: "Протеиновый коктейль", stems: ["протеин", "изолят", "гейнер", "bcaa"] },
  { slug: "voda", label: "Вода", stems: ["вода", "воды", "воду", "минералк"] },

  // Алкоголь — отдельными слагами: это самый сильный краткосрочный фактор
  // задержки воды, и в анализе он нужен именно как отдельный признак дня.
  { slug: "pivo", label: "Пиво", stems: ["пиво", "пива", "пивн", "эль", "лагер", "сидр"] },
  { slug: "vino", label: "Вино", stems: ["вино", "вина", "шампанск", "игрист", "просекко"] },
  { slug: "krepkiy-alkogol", label: "Крепкий алкоголь", stems: ["водк", "виск", "коньяк", "джин", "текил", "ликер", "ликёр", "бренди", "настойк"] },
];

/** Слаги алкоголя — для признака дня «алкоголь» в анализе веса. */
const ALCOHOL_SLUGS = new Set(["pivo", "vino", "krepkiy-alkogol"]);

/**
 * Основы, отсортированные по убыванию длины: побеждает самая длинная. Иначе
 * «куриная грудка» досталась бы «куриц» вместо «грудк», а весь смысл этой
 * пары в том, что грудка — отдельное блюдо со своим КБЖУ.
 */
const SORTED_STEMS: Array<{ stem: string; entry: DishEntry }> = DISHES
  .flatMap((entry) => entry.stems.map((stem) => ({ stem, entry })))
  .sort((a, b) => b.stem.length - a.stem.length);

const BY_SLUG = new Map(DISHES.map((entry) => [entry.slug, entry]));

/**
 * Служебные слова, после которых начинается уточнение, а не само блюдо:
 * «каша на молоке» — про кашу, «блины с творогом» — про блины. Тот же список,
 * что в lib/food-category.ts, и по той же причине.
 */
const TAIL_MARKERS = new Set(["с", "со", "и", "в", "во", "на", "из", "под", "без", "от", "к", "ко", "по", "до", "при"]);

const ADJECTIVE_ENDINGS = ["ого", "его", "ому", "ему", "ый", "ий", "ой", "ая", "яя", "ое", "ее", "ые", "ие", "ым", "им", "ом", "ем", "ую", "юю", "ых", "их"];
const ADJECTIVE_PENALTY = 3;

function looksLikeAdjective(word: string): boolean {
  return word.length > 4 && ADJECTIVE_ENDINGS.some((ending) => word.endsWith(ending));
}

/** Нормализация та же, что у частых приёмов: регистр, «ё», лишние пробелы. */
export function normalizeDishName(name: string): string {
  return name.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function words(name: string): string[] {
  return normalizeDishName(name)
    .replace(/[^a-zа-я0-9\- ]/g, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Родовое название слабее конкретного на две буквы — и проигрывает ему при
 * равном счёте.
 *
 * Одного штрафа мало: в «овсяной каше» прилагательное «овсяная» само получает
 * штраф как прилагательное, и счёт сходится вничью. Без правила о ничьей
 * результат зависел бы от порядка слов, и «овсяная каша» с «кашей овсяной»
 * разошлись бы по разным ключам — ровно та беда, ради которой этот модуль и
 * написан.
 */
const GENERIC_PENALTY = 2;

/**
 * Блюда, которые опознаются только словосочетанием целиком.
 *
 * Пословный разбор их не берёт по двум разным причинам. «Картофель фри» —
 * потому что побеждает длина: основа «картофел» (8 букв) перевешивает «фри»
 * (3), и жареная картошка сливалась бы с отварной, а у них разное всё.
 * «Селёдка под шубой» — потому что «под» служебное слово, после него разбор
 * обрывает название, и от салата оставалась одна селёдка.
 *
 * Сравниваются целые слова подряд, а не подстроки: подстрокой «фри» нашлось бы
 * во «фрикадельках».
 */
const PHRASES: Array<{ slug: string; words: string[] }> = [
  { slug: "shuba", words: ["сельдь", "под", "шубой"] },
  { slug: "shuba", words: ["селедка", "под", "шубой"] },
  { slug: "shuba", words: ["под", "шубой"] },
  { slug: "kartofel-fri", words: ["картофель", "фри"] },
  { slug: "kartofel-fri", words: ["картошка", "фри"] },
  { slug: "kartofel-fri", words: ["картофеля", "фри"] },
  { slug: "kartofel-fri", words: ["фри"] },
].sort((a, b) => b.words.length - a.words.length);

/** Первое словосочетание, целиком встретившееся в названии подряд идущими словами. */
function matchPhrase(parts: string[]): DishEntry | null {
  for (const phrase of PHRASES) {
    for (let start = 0; start + phrase.words.length <= parts.length; start += 1) {
      if (phrase.words.every((word, offset) => parts[start + offset] === word)) {
        const entry = BY_SLUG.get(phrase.slug);
        if (entry) return entry;
      }
    }
  }
  return null;
}

function bestDish(parts: string[]): DishEntry | null {
  let best: { score: number; entry: DishEntry } | null = null;
  for (const word of parts) {
    const penalty = looksLikeAdjective(word) ? ADJECTIVE_PENALTY : 0;
    for (const { stem, entry } of SORTED_STEMS) {
      if (!word.startsWith(stem)) continue;
      const score = stem.length - penalty - (entry.generic ? GENERIC_PENALTY : 0);
      const wins = !best
        || score > best.score
        || (score === best.score && best.entry.generic === true && entry.generic !== true);
      if (wins) best = { score, entry };
      break;
    }
  }
  return best?.entry ?? null;
}

export type DishKeyResult = {
  /** `dish:<слаг>` либо `cat:<категория>` — префикс не даёт уровням смешаться. */
  key: string;
  /** На каком уровне удалось опознать. */
  level: "dish" | "category";
  /** Подпись для отчётов — на русском и без кавычек. */
  label: string;
  category: FoodCategory;
  isAlcohol: boolean;
};

/**
 * Ключ одной позиции состава. Возвращается всегда: не нашлось блюда — вернётся
 * категория, не нашлось категории — `cat:other`. Отсутствие ключа означало бы,
 * что позиция выпадает из любого подсчёта молча, а это худший из исходов.
 */
export function dishKey(name: string): DishKeyResult {
  const parts = words(name);
  const category = foodCategory(name);

  if (parts.length > 0) {
    // Словосочетания — до разбора по словам: часть из них разбор по словам как
    // раз и портит (см. комментарий к PHRASES).
    const tailAt = parts.findIndex((word) => TAIL_MARKERS.has(word));
    const head = tailAt > 0 ? parts.slice(0, tailAt) : parts;
    const entry = matchPhrase(parts) ?? bestDish(head) ?? bestDish(parts);
    if (entry) {
      return {
        key: `dish:${entry.slug}`,
        level: "dish",
        label: entry.label,
        category,
        isAlcohol: ALCOHOL_SLUGS.has(entry.slug),
      };
    }
  }

  return {
    key: `cat:${category}`,
    level: "category",
    label: foodCategoryInfo(category).label,
    category,
    isAlcohol: false,
  };
}

/** Подпись по готовому ключу — для отчётов, собранных из одних ключей. */
export function dishKeyLabel(key: string): string {
  if (key.startsWith("dish:")) return BY_SLUG.get(key.slice(5))?.label ?? key;
  if (key.startsWith("cat:")) return foodCategoryInfo(key.slice(4) as FoodCategory).label;
  return key;
}

export function isAlcoholKey(key: string): boolean {
  return key.startsWith("dish:") && ALCOHOL_SLUGS.has(key.slice(5));
}

/** Сколько блюд знает словарь — для тестов и для отчёта о покрытии. */
export const DISH_COUNT = DISHES.length;

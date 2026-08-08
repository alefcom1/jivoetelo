/**
 * Источники каталога и подписи к ним.
 *
 * ## Зачем это отдельный модуль
 *
 * Атрибуция первоисточника — не оформление, а **условие, на котором мы этими
 * данными пользуемся**. По таблицам ФИЦ питания (справочники Скурихина и
 * Тутельяна) условие сформулировано прямо: указывать первоисточник в
 * описании и в интерфейсе программы. По остальным источникам разрешение
 * получено у владельцев, и там ссылка — вопрос честности, а не договора.
 *
 * Поэтому подпись живёт рядом с данными и берётся из строки таблицы, а не
 * пишется руками на каждом экране. Забыть её так нельзя: у позиции всегда
 * есть `source`, а у источника всегда есть подпись.
 *
 * ## Чего здесь нет
 *
 * Онлайн-платформы ФИЦ питания. Печатные таблицы химического состава и
 * цифровая платформа — разные вещи: первые используются свободно с
 * указанием первоисточника, вторая является объектом интеллектуальной
 * собственности, и прямой доступ к ней требует лицензионного соглашения с
 * институтом. Мы берём первое и не трогаем второе.
 */

export type CatalogSourceKey = "fic-tables" | "health-diet" | "dietagram" | "calculat" | "user";

export type CatalogSource = {
  key: CatalogSourceKey;
  /** Короткая подпись под числами — то, что видит человек. */
  label: string;
  /** Полное название первоисточника для страниц «о данных». */
  full: string;
  /** Ссылка, если у источника есть публичный адрес. */
  url: string | null;
  /**
   * Порядок в поиске при прочих равных. Меньше — выше. Таблицы ФИЦ идут
   * первыми среди импорта: это верифицированный научный первоисточник, а
   * остальные каталоги в конечном счёте пересказывают его же.
   */
  rank: number;
};

export const CATALOG_SOURCES: Record<CatalogSourceKey, CatalogSource> = {
  // Правки людей старше любого импорта: если позицию уточнили по упаковке,
  // это ближе к правде, чем усреднённая таблица.
  user: {
    key: "user",
    label: "Уточнено пользователями",
    full: "Уточнения пользователей «Живого Тела»",
    url: null,
    rank: 0,
  },
  "fic-tables": {
    key: "fic-tables",
    label: "Таблицы ФИЦ питания",
    full:
      "Химический состав российских пищевых продуктов: справочные таблицы " +
      "под редакцией И. М. Скурихина и В. А. Тутельяна, ФГБУН «ФИЦ питания и биотехнологии»",
    url: "https://ion.ru/",
    rank: 1,
  },
  "health-diet": {
    key: "health-diet",
    label: "health-diet.ru",
    full: "Каталог продуктов health-diet.ru, используется с разрешения владельца",
    url: "https://health-diet.ru/",
    rank: 2,
  },
  calculat: {
    key: "calculat",
    label: "calculat.ru",
    full: "Каталог продуктов и готовых блюд calculat.ru, используется с разрешения владельца",
    url: "https://calculat.ru/",
    rank: 3,
  },
  dietagram: {
    key: "dietagram",
    label: "Dietagram",
    full: "База продуктов Dietagram, используется с разрешения владельца",
    url: "http://dietagram.com/",
    rank: 4,
  },
};

export function isCatalogSource(value: string): value is CatalogSourceKey {
  return Object.hasOwn(CATALOG_SOURCES, value);
}

export function sourceLabel(source: string): string {
  return isCatalogSource(source) ? CATALOG_SOURCES[source].label : source;
}

export function sourceRank(source: string): number {
  return isCatalogSource(source) ? CATALOG_SOURCES[source].rank : 99;
}

/**
 * Строка для страницы «откуда числа» и для описания программы. Собирается из
 * тех же данных, что и подписи, — чтобы список источников не разошёлся с
 * тем, что реально лежит в базе.
 */
export function attributionList(): string[] {
  return Object.values(CATALOG_SOURCES)
    .filter((s) => s.key !== "user")
    .sort((a, b) => a.rank - b.rank)
    .map((s) => s.full);
}

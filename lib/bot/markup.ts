/**
 * Разметка сообщений бота.
 *
 * Telegram умеет два формата, и выбран HTML. MarkdownV2 требует экранировать
 * полтора десятка знаков — точку, дефис, скобки, восклицательный знак, — то
 * есть ровно те, из которых состоит обычная русская фраза. Один пропущенный
 * дефис там означает не кривой шрифт, а ошибку 400 и молчание бота. В HTML
 * особых знаков три, и все они в наших текстах не встречаются.
 *
 * Отсюда же правило: **любой подставленный в сообщение текст пропускать через
 * `escapeHtml`.** Сейчас в шаблоны подставляются только числа, но имя
 * пользователя или подпись к фото однажды туда попадут, а имя вида
 * `<Аня>` сломает разбор.
 */

/** Теги, которые Telegram понимает и которыми мы пользуемся. */
const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "code", "pre", "a", "blockquote"]);

/** Три знака, из-за которых Telegram отвергает сообщение с разметкой. */
export function escapeHtml(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Проверяет, что строку можно отправить с `parse_mode: HTML`: теги знакомые и
 * закрыты, голых `<` и `&` нет.
 *
 * Возвращает описание первой найденной беды или `null`, если всё в порядке.
 * Нужна не в рантайме, а в тестах: тексты у нас статические, и поймать в них
 * сломанную разметку надо до выкатки, а не по ошибке 400 в логе.
 */
export function htmlProblem(text: string): string | null {
  // Амперсанд допустим только как начало известной сущности.
  const badAmp = text.match(/&(?!amp;|lt;|gt;|quot;|#\d+;)/);
  if (badAmp) return `голый «&» — экранируйте как &amp;`;

  const open: string[] = [];
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^<>]*)?)>/g;
  let consumed = 0;
  let match: RegExpExecArray | null;

  while ((match = tag.exec(text)) !== null) {
    // Всё, что между тегами, не должно содержать «<» — иначе это не тег, а знак.
    if (text.slice(consumed, match.index).includes("<")) return "голый «<» — экранируйте как &lt;";
    consumed = match.index + match[0].length;

    const [, closing, name] = match;
    const lower = name.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return `тег <${name}> Telegram не понимает`;

    if (closing) {
      if (open.pop() !== lower) return `</${name}> закрывает не то, что открыто`;
    } else {
      open.push(lower);
    }
  }

  if (text.slice(consumed).includes("<")) return "голый «<» — экранируйте как &lt;";
  if (open.length > 0) return `не закрыт тег <${open[open.length - 1]}>`;
  return null;
}

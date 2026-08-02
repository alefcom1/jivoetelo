import { compressPhotoForAi } from "@/lib/ai/image";
import { verifyPhotoLink } from "@/lib/ai/photo-link";
import { isPhotoKey, photoMimeType, readPhoto } from "@/lib/storage";

/**
 * Снимок по подписанной ссылке — единственный маршрут с фото без авторизации.
 *
 * ## Кто сюда ходит
 *
 * Не человек и не наш интерфейс, а серверы Anthropic. Разбор фото упирался
 * в вес запроса: тело тяжелее ~32 КБ до прокси не доезжает (замеры — в
 * lib/ai/photo-link.ts). Поэтому картинку мы больше не отправляем, а даём
 * на неё ссылку, и модель забирает снимок сама.
 *
 * ## Почему без авторизации и почему это не дыра
 *
 * У чужого сервера нет ни нашей сессии, ни initData Telegram — проверять
 * нечего. Вместо этого проверяется подпись: адрес нельзя угадать, он живёт
 * пять минут, а ключ файла лежит внутри подписанной части, так что перебрать
 * чужие снимки, меняя цифры в адресе, невозможно.
 *
 * Всё, что не сошлось, отвечает одинаковым 404 — просроченный срок, битая
 * подпись и несуществующий файл снаружи неразличимы. Разные ответы здесь
 * подсказывали бы, какие ключи существуют.
 *
 * ## Почему отдаём сжатую копию
 *
 * Токены зрения считаются по пикселям: телефонный кадр 4000 px обошёлся бы
 * вчетверо дороже уменьшенного. Раз копию для модели мы всё равно готовим
 * (lib/ai/image.ts), логично отдать именно её, а не оригинал с диска.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const startedAt = Date.now();

  /**
   * Каждый исход попадает в лог, и это не отладочный мусор.
   *
   * Сюда ходит чужой сервер, которого мы не видим. Когда разбор фото встал,
   * различить «Anthropic не пришёл вовсе», «пришёл и получил 404» и «пришёл,
   * получил картинку, но что-то пошло дальше» было решительно нечем: маршрут
   * молчал при любом исходе. Одна строка на запрос закрывает весь этот вопрос,
   * а запросов тут ровно столько же, сколько разборов по фото.
   */
  const done = (outcome: string, extra = "") => {
    console.log(`[ai-photo] ${outcome} за ${Date.now() - startedAt} мс${extra}`);
  };
  const notFound = (why: string) => {
    done(why);
    return new Response("Not found", { status: 404 });
  };

  const { token } = await params;
  const key = verifyPhotoLink(token);
  if (!key) return notFound("подпись не сошлась или срок вышел");
  if (!isPhotoKey(key)) return notFound("ключ неверной формы");

  const data = await readPhoto(key);
  if (!data) return notFound(`файла нет: ${key}`);

  // Без потолка по весу: по ссылке снимок едет обычным HTTP внутрь, а не
  // через прокси, где тело тяжелее ~32 КБ не проходит. Уменьшаем только
  // пиксели — их считает модель, — и кодируем один раз, а не четыре.
  const compressed = await compressPhotoForAi(data, Number.POSITIVE_INFINITY);
  const body = compressed?.data ?? data;
  const mediaType = compressed?.mediaType ?? photoMimeType(key);
  done("отдали", ` — ${key}, ${Math.round(data.length / 1024)} → ${Math.round(body.length / 1024)} КБ`);

  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": mediaType,
      "content-length": String(body.length),
      // Ссылка одноразовая по смыслу: кэшировать её негде и незачем, а
      // «noindex» — на случай, если адрес когда-нибудь утечёт в лог краулера.
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

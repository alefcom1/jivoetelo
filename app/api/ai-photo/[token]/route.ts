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
  const notFound = () => new Response("Not found", { status: 404 });

  const { token } = await params;
  const key = verifyPhotoLink(token);
  if (!key || !isPhotoKey(key)) return notFound();

  const data = await readPhoto(key);
  if (!data) return notFound();

  const compressed = await compressPhotoForAi(data);
  const body = compressed?.data ?? data;
  const mediaType = compressed?.mediaType ?? photoMimeType(key);

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

import { readOwnedPhoto } from "@/lib/storage";
import { authorize } from "../../_auth";

/**
 * Раздача снимков еды внутри Mini App.
 *
 * app/api/photos авторизуется веб-сессией (cookie jt_session), а у Telegram
 * WebView этой cookie попросту нет — он живёт подписью initData, которую
 * клиент присылает заголовком к каждому запросу (см. app/tg/api.ts). Поэтому
 * <img src="/api/photos/..."> внутри Mini App получал 401 на каждый снимок:
 * ни превью в камере, ни фото в инбоксе не показывались. Это отдельный
 * маршрут с тем же по сути содержимым, но проверкой initData вместо cookie —
 * переиспользовать веб-раздатчик и подменять ему способ авторизации было бы
 * рискованнее, чем завести соседний файл.
 *
 * Владение снимком проверяется тем же способом, что и в app/api/photos —
 * см. photoBelongsTo в lib/storage.ts: ключ имеет вид `<userId>/<uuid>.<ext>`,
 * и без совпадения userId запрос получает 404, а не чужие байты.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;

  const { key } = await params;
  const photo = await readOwnedPhoto(auth.user.id, key.join("/"));
  if (!photo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      // private: сам браузер/WebView может кешировать, а общий CDN/прокси — нет,
      // это чужие снимки еды, а не статика.
      "Cache-Control": "private, max-age=3600",
    },
  });
}

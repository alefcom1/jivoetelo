import sharp from "sharp";

/**
 * Сжатие фото ПЕРЕД отправкой в AI — самый крупный рычаг экономии токенов.
 *
 * Снимок с телефона уходит в модель как есть: длинная сторона легко за
 * 3000–4000 px, а это до ~4784 токенов зрения на один кадр (Claude считает
 * токены зрения от числа пикселей). Для распознавания еды такое разрешение
 * бессмысленно — модели важны цвет, форма и относительный размер порций,
 * а не резкость на уровне отдельного зерна риса. Длинная сторона в
 * MAX_DIMENSION_PX даёт то же качество разбора при кратно меньшем счёте.
 *
 * Сжимаем только копию, которая уходит в AI. В хранилище (lib/storage.ts)
 * остаётся оригинал — это то, что показывается пользователю на странице
 * приёма пищи, и его качество не должно зависеть от того, как мы экономим
 * на распознавании.
 */
const MAX_DIMENSION_PX = 1024;
const JPEG_QUALITY = 82;

export type CompressedPhoto = { data: Buffer; mediaType: "image/jpeg" };

/**
 * Уменьшает фото до `MAX_DIMENSION_PX` по длинной стороне (пропорции
 * сохраняются, апскейла нет — `withoutEnlargement` подстраховывает расчёт
 * выше) и перекодирует в JPEG. `rotate()` без аргументов — авто-поворот по
 * EXIF: у телефонных снимков ориентация часто лежит в EXIF-теге, а не в
 * самих пикселях, и без этого шага модель может получить кадр, повёрнутый
 * на 90°.
 *
 * Возвращает `null` в двух случаях, и вызывающий код обрабатывает их
 * одинаково — отправляет в AI оригинал как есть:
 *  - исходник уже не больше предела. Токены зрения считаются от числа
 *    пикселей, а не от байтов, так что перекодирование без изменения
 *    геометрии токенов не сэкономит, а качество (прозрачность PNG, кадр
 *    GIF) может испортить зря — трогать нечего;
 *  - sharp упал на обработке (повреждённый файл, экзотический кодек,
 *    нехватка памяти). Сжатие — это оптимизация, а не обязательное условие
 *    разбора, поэтому ошибку не бросаем.
 */
export async function compressPhotoForAi(data: Buffer): Promise<CompressedPhoto | null> {
  try {
    const metadata = await sharp(data, { failOn: "none" }).metadata();
    const longSide = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    if (longSide > 0 && longSide <= MAX_DIMENSION_PX) {
      return null;
    }

    const compressed = await sharp(data, { failOn: "none" })
      .rotate()
      .resize({
        width: MAX_DIMENSION_PX,
        height: MAX_DIMENSION_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    return { data: compressed, mediaType: "image/jpeg" };
  } catch (error) {
    console.error("photo compression failed, sending original to AI", error);
    return null;
  }
}

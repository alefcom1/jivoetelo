import { Crown, monogramHue, monogramLetter } from "../avatar";

/**
 * Аватар в веб-кабинете: фото, если человек его поставил, иначе монограмма.
 *
 * Картинка идёт через `/api/photos` — маршрут с проверкой владельца, тот же,
 * что отдаёт снимки еды. Прямой ссылки на файл не существует: каталог
 * загрузок наружу не выставлен, и фото профиля здесь не исключение.
 *
 * `<img>`, а не `next/image`: оптимизатор Next ходит за исходником сам,
 * своим запросом без cookie, — а маршрут отдаёт файл только владельцу
 * сессии. Получилась бы вечная заглушка вместо фото.
 */
export function UserAvatar({
  avatarKey,
  email,
  premium,
  size = 36,
}: {
  avatarKey: string | null;
  email: string | null;
  premium: boolean;
  size?: number;
}) {
  return <span className="user-avatar" style={{ width: size, height: size }}>
    {avatarKey
      // eslint-disable-next-line @next/next/no-img-element
      ? <img className="user-avatar-photo" src={`/api/photos/${avatarKey}`} alt="" width={size} height={size} />
      : <span
          className="user-avatar-monogram"
          style={{ "--food-hue": monogramHue(email) } as React.CSSProperties}
          aria-hidden
        >
          {monogramLetter(email)}
        </span>}
    {/* Корона только при открытом доступе. Заголовок у неё есть: значок без
        подписи — загадка, а не признак, и объяснять его человеку негде. */}
    {premium && <span className="user-avatar-crown" title="Доступ открыт">
      <Crown className="" />
    </span>}
  </span>;
}

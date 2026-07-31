import Image from "next/image";
import { botLink, type StartPayload } from "@/lib/bot-public";

/**
 * Блок «дневник живёт в телефоне»: три экрана приложения и вход в него.
 *
 * ## Главное решение — вход зависит от устройства
 *
 * QR-код бесполезен на телефоне: свой экран не отсканируешь. А на сайт с
 * телефона заходят чаще, чем с компьютера. Поэтому в разметке есть оба
 * входа, а лишний скрывается медиазапросом — без JavaScript и без ожидания
 * гидратации, чтобы правильный вариант был виден сразу, а не после мигания.
 *
 * На широком экране — QR с подписью «наведите камеру телефона». Подпись
 * обязательна: без неё часть людей не понимает, что с кодом делать.
 * На узком — обычная кнопка, она открывает Telegram прямо здесь.
 *
 * ## Почему скриншоты настоящие
 *
 * Это снимки нашего же интерфейса из docs/screenshots, а не нарисованный
 * макет. Нарисованный макет обещает то, чего может не оказаться; снимок
 * обещает ровно то, что человек увидит. По той же причине мы отказались от
 * стоковых фотографий еды в Mini App.
 *
 * ## Метка в ссылке
 *
 * `start` говорит боту, откуда человек пришёл, чтобы приветствие не
 * предлагало посчитать норму тому, кто её только что посчитал.
 */

const SHOTS = [
  { src: "/app/today.webp", alt: "Экран «Сегодня»: кольцо энергии и макросы за день", caption: "Сколько уже съедено — одним взглядом" },
  { src: "/app/camera.webp", alt: "Разбор фотографии еды с составом и порциями", caption: "Сфотографировали — состав посчитан" },
  { src: "/app/plan.webp", alt: "Экран плана с нормой и тем, как она посчитана", caption: "И видно, откуда взялась норма" },
];

export function AppInvite({
  title,
  lead,
  start,
  qr,
  wide,
}: {
  title: string;
  lead: string;
  start: StartPayload;
  /** Файл QR под эту метку — генерируется scripts/qr.mjs. */
  qr: string;
  /**
   * Поля как у главной (1280px), а не как у статьи (900px). Ширина колонки
   * с текстом — свойство страницы, а не блока: на главной блок между
   * секциями шириной в 1280 выглядел бы случайно съехавшим внутрь.
   * Ширину самих снимков это не меняет — она ограничена в CSS.
   */
  wide?: boolean;
}) {
  return <section className={wide ? "invite invite-wide" : "invite"}>
    <div className="invite-head">
      <h2>{title}</h2>
      <p>{lead}</p>
    </div>

    <div className="invite-shots">
      {SHOTS.map((shot) => (
        <figure key={shot.src}>
          <Image src={shot.src} alt={shot.alt} width={560} height={1212} sizes="(max-width: 850px) 40vw, 280px" />
          <figcaption>{shot.caption}</figcaption>
        </figure>
      ))}
    </div>

    <div className="invite-enter">
      {/* Оба входа в разметке, лишний прячет CSS: так правильный виден
          сразу, а не после того, как отработает скрипт. */}
      <div className="invite-qr">
        <Image src={qr} alt={`QR-код со ссылкой на бота ${botLink(start)}`} width={180} height={180} unoptimized />
        <p>Наведите камеру телефона — откроется Telegram</p>
      </div>
      <a className="invite-button black-button" href={botLink(start)} target="_blank" rel="noreferrer">
        Открыть в Telegram <b>↗</b>
      </a>
    </div>
  </section>;
}

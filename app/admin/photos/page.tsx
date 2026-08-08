import Link from "next/link";
import { PHOTO_CREDIT } from "@/lib/catalog-photos";
import { pendingPhotos, photoCandidates } from "@/lib/catalog-photos-store";
import { PRODUCTS } from "@/lib/products";
import { findProduct } from "@/lib/products";
import { offerCatalogPhotoAction, reviewCatalogPhotoAction } from "../actions";

/**
 * Очередь модерации снимков каталога.
 *
 * Модерация здесь обязательная и ручная, и это не перестраховка: на снимке
 * еды регулярно оказывается то, чего автор не имел в виду публиковать —
 * лица за столом, интерьер кухни, документы рядом с тарелкой, отражения в
 * посуде. Автоматически это не ловится, а опубликованное уже опубликовано.
 *
 * Поэтому страница показывает сам кадр крупно, а не строку в таблице:
 * модерация по подписи — это не модерация.
 */
export const dynamic = "force-dynamic";

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminPhotosPage() {
  const [queue, candidates] = await Promise.all([pendingPhotos(), photoCandidates()]);

  return <main className="admin-page">
    <p className="kicker"><Link href="/admin">Админка</Link></p>
    <h1>Снимки в каталог</h1>

    <p className="field-note">
      Смотрим не на еду, а на всё остальное в кадре: людей, лица, документы, экраны, отражения
      в посуде и стекле. Если сомневаетесь — отклоняйте: снятый снимок вернуть можно,
      опубликованный — нет.
    </p>

    {queue.length === 0
      ? <p className="admin-empty">Очередь пуста.</p>
      : <ul className="admin-photo-queue">
          {queue.map((photo) => {
            const product = findProduct(photo.productSlug);
            return <li key={photo.id}>
              {/* Своя разметка вместо next/image: оптимизация выключена в
                  конфиге, компонент дал бы только лишний слой. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/admin/photo/${photo.id}`} alt={photo.caption} />

              <div className="admin-photo-body">
                <h2>{product ? product.name : photo.productSlug}</h2>
                {!product && <p className="form-error">
                  Продукта «{photo.productSlug}» в каталоге больше нет — публиковать некуда.
                </p>}

                <dl className="admin-photo-meta">
                  <div><dt>Подпись</dt><dd>{photo.caption}</dd></div>
                  <div><dt>Атрибуция</dt><dd>{PHOTO_CREDIT}</dd></div>
                  <div><dt>Прислал</dt><dd>{photo.authorEmail ?? "—"}</dd></div>
                  <div><dt>Когда</dt><dd>{dateTimeFormat.format(photo.createdAt)}</dd></div>
                  <div>
                    <dt>Согласие</dt>
                    <dd>{photo.consentActive
                      ? "действует"
                      : "отозвано — публиковать нельзя"}</dd>
                  </div>
                </dl>

                {/* Согласие могли отозвать между отправкой и разбором. Снимок
                    в очереди остаётся видимым, чтобы модератор понимал, куда
                    он делся, но одобрить его нельзя. */}
                <form action={reviewCatalogPhotoAction} className="admin-photo-actions">
                  <input type="hidden" name="id" value={photo.id} />
                  {/* Два поля, а не одно. Первое человек прочитает, второе
                      не должен: «на снимке видно документы» — это ему, а
                      «дубль вчерашнего» — себе. В одном поле они неминуемо
                      перемешались бы, и однажды внутренняя пометка ушла бы
                      автору. */}
                  <input
                    type="text"
                    name="reason"
                    placeholder="Что написать автору — он это получит"
                    maxLength={500}
                  />
                  <input
                    type="text"
                    name="moderatorNote"
                    placeholder="Заметка для себя — автор её не увидит"
                    maxLength={500}
                  />
                  <div className="button-row">
                    <button
                      className="black-button"
                      type="submit"
                      name="decision"
                      value="approved"
                      disabled={!photo.consentActive || !product}
                    >
                      Опубликовать
                    </button>
                    <button className="link-button" type="submit" name="decision" value="rejected">
                      Отклонить
                    </button>
                  </div>
                </form>
              </div>
            </li>;
          })}
        </ul>}

    {/* ── Банк кандидатов ──────────────────────────────────────────────────
        Очередь выше была пуста не из-за ошибки: единственный путь в неё вёл
        из карточки приёма пищи руками автора — найти запись, выбрать
        продукт, поставить галочку, отправить. Четыре шага, и их не делал
        никто. Здесь разговор начинает модератор.

        Предложение не публикует снимок. Оно спрашивает автора, и до его
        «да» кадр не виден никому: молчание согласием на распространение не
        считается (152-ФЗ, ст. 10.1 ч. 8). */}
    <h2 className="admin-section-head">Кандидаты из дневников</h2>
    <p className="field-note">
      Снимки, которые ещё никому не предлагали. Выберите продукт — автору уйдёт вопрос, можно ли
      поставить этот кадр на его страницу. Люди, запретившие предложения в настройках, сюда не
      попадают. Отказ автора помечает кадр отвеченным: второй раз он не появится.
    </p>

    {candidates.length === 0
      ? <p className="admin-empty">Новых снимков нет.</p>
      : <ul className="admin-photo-queue admin-photo-candidates">
          {candidates.map((candidate) => (
            <li key={candidate.photoKey}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/admin/candidate/${encodeURIComponent(candidate.photoKey)}`}
                alt={candidate.items.join(", ") || "Снимок из дневника"}
              />
              <div className="admin-photo-body">
                <h3>{candidate.items.join(", ") || "Без разбора"}</h3>
                <p className="field-note">Запись от {candidate.eatenOn}</p>
                <form action={offerCatalogPhotoAction} className="admin-photo-actions">
                  <input type="hidden" name="userId" value={candidate.userId} />
                  <input type="hidden" name="photoKey" value={candidate.photoKey} />
                  <select name="productSlug" required defaultValue="">
                    <option value="" disabled>Какой продукт на снимке</option>
                    {PRODUCTS.map((product) => (
                      <option key={product.slug} value={product.slug}>{product.name}</option>
                    ))}
                  </select>
                  <input type="number" name="grams" min={1} max={3000} placeholder="Граммы, если видно" />
                  <div className="button-row">
                    <button className="black-button" type="submit">Предложить автору</button>
                  </div>
                </form>
              </div>
            </li>
          ))}
        </ul>}
  </main>;
}

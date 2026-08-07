import Link from "next/link";
import { PHOTO_CREDIT } from "@/lib/catalog-photos";
import { pendingPhotos } from "@/lib/catalog-photos-store";
import { findProduct } from "@/lib/products";
import { reviewCatalogPhotoAction } from "../actions";

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
  const queue = await pendingPhotos();

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
  </main>;
}

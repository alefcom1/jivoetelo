import { findProduct } from "@/lib/products";
import { offersFor, photoOffersOptOut } from "@/lib/catalog-photos-store";
import { answerPhotoOffer, setPhotoOffers } from "../photo-offer-actions";

/**
 * Блок «Фотографии в каталоге»: зачем они нужны, что предложено и выключатель.
 *
 * Объяснение стоит первым и написано словами, а не ссылкой на документ.
 * Человек, которого спрашивают про его фотографию, имеет право сразу понять
 * три вещи: зачем это нам, что именно окажется на странице и чего там не
 * будет. Последнее важнее первых двух — «имя не указываем» снимает главный
 * вопрос ещё до того, как он задан.
 */
export async function PhotoOffers({ userId }: { userId: number }) {
  const [offers, optOut] = await Promise.all([offersFor(userId), photoOffersOptOut(userId)]);

  return <div className="photo-offers">
    <p>
      В каталоге продуктов и блюд мы показываем настоящие снимки — по одной причине: чужая
      домашняя тарелка отвечает на вопрос «как выглядит эта порция» лучше, чем студийное фото
      из стока, одинаковое на пяти сайтах. Свои снимки для этого мы берём из дневников — с
      согласия автора и по одному кадру, а не пачкой.
    </p>
    <p className="field-note">
      На странице оказывается только сам снимок и подпись вида «Творог 5%, порция 150 г». Ни
      имени, ни адреса, ни чего-либо ещё из вашего дневника: атрибуция — «снимок читателя
      „Живого Тела“». Кадр смотрит человек, а не программа: если в нём видны лица, документы или
      что угодно ещё за пределами еды, он не пойдёт дальше.
    </p>

    {offers.length > 0 && <div className="photo-offer-list">
      {offers.map((offer) => {
        const product = findProduct(offer.productSlug);
        return <div key={offer.id} className="photo-offer">
          {/* Превью снимка не показываем: он лежит в дневнике этого же
              человека, а подпись называет продукт и порцию — этого хватает,
              чтобы понять, о каком кадре речь, и не хватает, чтобы блок
              превратился во вторую галерею. */}
          <p>
            Ваш снимок хорошо показывает <strong>{product ? product.name : offer.productSlug}</strong>.
            Поставить его на страницу продукта? Подпись будет такой: «{offer.caption}».
          </p>
          <form action={answerPhotoOffer} className="photo-offer-actions">
            <input type="hidden" name="offerId" value={offer.id} />
            <button className="black-button" type="submit" name="answer" value="yes">Можно</button>
            <button className="link-button" type="submit" name="answer" value="no">Не надо</button>
          </form>
        </div>;
      })}
    </div>}

    {/* Выключатель — не про уже опубликованное, а про будущие вопросы.
        Разница названа прямо: отзыв согласия убирает снимки со страниц и
        живёт отдельной кнопкой ниже. */}
    <form action={setPhotoOffers.bind(null, !optOut)} className="photo-offers-toggle">
      <button className="link-button" type="submit">
        {optOut ? "Снова предлагать публикацию моих снимков" : "Не предлагать публиковать мои снимки"}
      </button>
      <p className="field-note">
        {optOut
          ? "Сейчас мы не спрашиваем про ваши фотографии и не показываем их модератору."
          : "Выключит сами вопросы: снимки не попадут даже к модератору. Уже опубликованное это не трогает — для этого отзыв согласия ниже."}
      </p>
    </form>
  </div>;
}

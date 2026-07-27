import type { Metadata } from "next";
import { FeatureGrid, PageCta, PageHero, PageIntro } from "../components/marketing-sections";
import { SiteIcon } from "../components/site-chrome";

export const metadata: Metadata = {
  title: "AI-камера питания",
  description: "Как JIVELO распознаёт блюда по фото, показывает уверенность и уточняет скрытые ингредиенты.",
};

export default function AiFoodCameraPage() {
  return <main className="inner-page camera-page">
    <PageHero
      eyebrow="JIVELO Vision"
      icon="camera"
      title="Фото становится дневником."
      accent="Но не притворяется лабораторией."
      text="JIVELO разбирает блюдо на компоненты, оценивает порции диапазоном и честно показывает, где системе нужна ваша помощь."
      secondary="Как работает точность"
      secondaryHref="#confidence"
      visual={<div className="vision-hero-card">
        <div className="vision-hero-photo"><i className="vision-scan"/><span className="vision-tag tag-a">Лосось <b>142 г</b></span><span className="vision-tag tag-b">Картофель <b>184 г</b></span><span className="vision-tag tag-c">Салат <b>116 г</b></span><div className="vision-corners"><i/><i/><i/><i/></div></div>
        <div className="vision-result"><div><span><SiteIcon name="spark" size={16}/></span><p><small>АНАЛИЗ ГОТОВ</small><b>3 компонента · 1 уточнение</b></p><em>Высокая уверенность</em></div><section><span><b>474</b>ккал</span><span><b>38 г</b>белок</span><span><b>13 г</b>жиры</span></section><button>Какая была заправка? <SiteIcon name="arrow" size={16}/></button></div>
      </div>}
    />

    <section className="shell page-section">
      <PageIntro eyebrow="От снимка до записи" icon="spark" title={<>Четыре шага.<br/><em>Ни одного чёрного ящика.</em></>} text="Система показывает промежуточный результат и оставляет пользователю последнее слово перед сохранением."/>
      <div className="camera-steps">
        <article><span>01</span><div className="step-visual capture"><SiteIcon name="camera" size={30}/><i/><i/></div><h3>Сделайте снимок</h3><p>JIVELO подсказывает ракурс и проверяет, достаточно ли хорошо видно блюдо.</p></article>
        <article><span>02</span><div className="step-visual detect"><i>1</i><i>2</i><i>3</i></div><h3>Проверьте компоненты</h3><p>Каждый элемент блюда можно переименовать, удалить или изменить по весу.</p></article>
        <article><span>03</span><div className="step-visual clarify"><SiteIcon name="spark"/><b>Масло?</b><small>Да · Нет</small></div><h3>Ответьте на главное</h3><p>Не анкета из десяти вопросов, а одно уточнение с максимальным влиянием.</p></article>
        <article><span>04</span><div className="step-visual save"><SiteIcon name="check" size={30}/><b>В дневнике</b></div><h3>Сохраните оценку</h3><p>Итог остаётся редактируемым, а исправление помогает учитывать ваши привычки позже.</p></article>
      </div>
    </section>

    <section className="confidence-section page-section" id="confidence"><div className="shell confidence-layout">
      <div className="confidence-copy"><PageIntro eyebrow="Честная точность" icon="shield" title={<>Не одна цифра,<br/><em>а понятная уверенность.</em></>} text="На точность влияют видимость блюда, сложность рецепта, размер порции, скрытое масло и качество сопоставления с базой." align="center"/><ul><li><SiteIcon name="check" size={15}/>Диапазон порции вместо фальшивой точности до грамма</li><li><SiteIcon name="check" size={15}/>Источник пищевых данных у каждого компонента</li><li><SiteIcon name="check" size={15}/>Уточнение только для значимых неизвестных</li></ul></div>
      <div className="confidence-matrix">
        <article className="high"><span>Высокая</span><b>Лосось на гриле</b><p>Простой видимый продукт, понятный способ приготовления.</p><small>Оценка: 130–155 г</small></article>
        <article className="medium"><span>Средняя</span><b>Картофельное пюре</b><p>Порция видна, но молоко и масло требуют предположения.</p><small>Оценка: 170–220 г</small></article>
        <article className="clarify"><span>Нужно уточнить</span><b>Сливочный соус</b><p>Состав невозможно надёжно определить только по фотографии.</p><button>Выбрать состав</button></article>
      </div>
    </div></section>

    <section className="shell page-section camera-limits">
      <PageIntro eyebrow="Где камера особенно полезна" icon="camera" title={<>От простой тарелки<br/><em>до знакомого домашнего блюда.</em></>} text="Интерфейс меняется под сложность еды: простое блюдо сохраняется быстро, а смешанное получает понятный режим проверки."/>
      <div className="meal-types">
        <article className="simple"><div/><span>Простая тарелка</span><h3>Видимые компоненты</h3><p>Рыба, гарнир, овощи и фрукты распознаются наиболее уверенно.</p></article>
        <article className="mixed"><div/><span>Смешанное блюдо</span><h3>Рецепт и диапазон</h3><p>Суп, запеканка или боул получают уточнения по основе и заправке.</p></article>
        <article className="package"><div><i/><i/><i/></div><span>Упаковка</span><h3>Этикетка и бренд</h3><p>Камера считывает название, массу и пищевую ценность с этикетки.</p></article>
        <article className="restaurant"><div/><span>Ресторан</span><h3>Оценка без иллюзий</h3><p>Система отмечает повышенную неопределённость из-за масла и соусов.</p></article>
      </div>
    </section>

    <section className="shell page-section vision-privacy">
      <div className="privacy-photo"><span><SiteIcon name="shield"/></span><b>Фото под вашим контролем</b></div>
      <div><PageIntro eyebrow="Приватность изображения" icon="shield" title={<>Удалите фото.<br/><em>Сохраните запись.</em></>} text="Пользователь сможет удалить оригинальный снимок, не теряя рассчитанное блюдо. Доступ специалистов и AI-обработка управляются отдельными разрешениями." align="center"/></div>
    </section>

    <PageCta eyebrow="Попробуйте на своей тарелке" title={<>Снимок занимает секунду.<br/><em>Понимание остаётся с вами.</em></>} text="Присоединяйтесь к раннему доступу JIVELO Vision." button="Попробовать AI-камеру"/>
  </main>;
}

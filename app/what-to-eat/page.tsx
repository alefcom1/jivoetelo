import type { Metadata } from "next";
import { FeatureGrid, PageCta, PageHero, PageIntro } from "../components/marketing-sections";
import { SiteIcon } from "../components/site-chrome";

export const metadata: Metadata = {
  title: "Что съесть сейчас",
  description: "Персональные идеи еды с учётом дневного баланса, голода, времени, бюджета и продуктов дома.",
};

export default function WhatToEatPage() {
  return <main className="inner-page eat-page">
    <PageHero
      theme="dark"
      eyebrow="Решение вместо отчёта"
      icon="spark"
      title="Не спрашивайте"
      accent="«сколько осталось?»"
      text="Спросите, что подойдёт именно сейчас. JIVELO соединяет дневной баланс с голодом, временем, бюджетом, предпочтениями и продуктами дома."
      primary="Подобрать свой вариант"
      secondary="Как работает подбор"
      secondaryHref="#ranking"
      visual={<div className="eat-console-hero">
        <div className="eat-context"><span>15 минут</span><span>Дома</span><span>До 700 ккал</span><span>Много белка</span></div>
        <div className="eat-card-photo"><span><SiteIcon name="spark" size={15}/> Лучшее совпадение</span><i>42 г белка</i></div>
        <div className="eat-card-body"><div><small>JIVELO РЕКОМЕНДУЕТ</small><h3>Тёплый боул с курицей</h3><p>Булгур · овощи · йогуртовый соус</p></div><strong>624<small>ккал</small></strong></div>
        <div className="eat-why"><b>Почему подходит</b><p>Закрывает дефицит белка и использует продукты из избранного.</p></div>
      </div>}
    />

    <section className="shell page-section">
      <PageIntro eyebrow="Контекст сегодняшнего дня" icon="target" title={<>Одна рекомендация<br/><em>учитывает больше, чем калории.</em></>} text="Система сначала исключает неподходящие варианты, затем ранжирует оставшиеся по пользе, удобству и вашим привычкам."/>
      <div className="context-board">
        <article><span><SiteIcon name="chart"/></span><small>ДНЕВНОЙ БАЛАНС</small><b>680 ккал</b><p>42 г белка · 9 г клетчатки</p></article>
        <article><span><SiteIcon name="leaf"/></span><small>ГОЛОД</small><b>Сильный</b><p>Нужен сытный полноценный ужин</p></article>
        <article><span><SiteIcon name="target"/></span><small>УСЛОВИЯ</small><b>15 минут</b><p>Без сложной готовки</p></article>
        <article><span><SiteIcon name="recipe"/></span><small>ДОМА ЕСТЬ</small><b>Курица, томаты</b><p>Йогурт · зелень · булгур</p></article>
        <div className="context-flow"><i/><i/><i/><i/><span><SiteIcon name="spark"/><b>3 лучших варианта</b></span></div>
      </div>
    </section>

    <section className="eat-scenarios page-section"><div className="shell">
      <PageIntro eyebrow="Для реальной жизни" icon="leaf" title={<>Не только «приготовить дома».<br/><em>Любой нормальный день.</em></>} text="JIVELO умеет предложить полноценную готовку, быстрый перекус, готовый продукт, ресторанное блюдо или семейный вариант."/>
      <div className="scenario-grid">
        <article className="home"><div/><span>Дома · 20 минут</span><h3>Тёплый ужин из запасов</h3><p>Система собирает блюдо из продуктов в холодильнике и считает порцию.</p><b>610–680 ккал</b></article>
        <article className="ready"><div/><span>Ничего не готовить</span><h3>Готовая комбинация</h3><p>Творог, ягоды, хлеб и салат без рецепта и лишних действий.</p><b>480–540 ккал</b></article>
        <article className="restaurant"><div/><span>В ресторане</span><h3>Лучший вариант из меню</h3><p>Сравнение блюд по составу, сытости и текущему балансу дня.</p><b>Выбор из 4 блюд</b></article>
        <article className="family"><div/><span>Для семьи</span><h3>Одно блюдо — разные порции</h3><p>Один список покупок и понятные порции для разных целей.</p><b>Режим Family</b></article>
      </div>
    </div></section>

    <section className="shell page-section" id="ranking">
      <PageIntro eyebrow="Прозрачный подбор" icon="spark" title={<>JIVELO объясняет,<br/><em>почему вариант оказался первым.</em></>} text="Рекомендация не должна выглядеть как магический ответ AI. Вы видите основные факторы и можете изменить любой из них."/>
      <div className="ranking-demo">
        <div className="ranking-list">
          <article className="winner"><span>01</span><div className="rank-photo one"/><div><small>ЛУЧШЕЕ СОВПАДЕНИЕ</small><h3>Боул с курицей и булгуром</h3><p>18 минут · 42 г белка · продукты дома</p></div><strong>94%</strong></article>
          <article><span>02</span><div className="rank-photo two"/><div><h3>Лосось с овощами</h3><p>25 минут · 39 г белка · нужно докупить</p></div><strong>86%</strong></article>
          <article><span>03</span><div className="rank-photo three"/><div><h3>Ролл с индейкой</h3><p>Без готовки · 36 г белка · легче по калориям</p></div><strong>82%</strong></article>
        </div>
        <div className="ranking-factors"><small>ПОЧЕМУ ВАРИАНТ №1</small><h3>Совпадение с вашим днём</h3><div><span>Белок</span><i><b style={{width:"94%"}}/></i><strong>Высоко</strong></div><div><span>Время</span><i><b style={{width:"88%"}}/></i><strong>18 мин</strong></div><div><span>Продукты дома</span><i><b style={{width:"100%"}}/></i><strong>Все есть</strong></div><div><span>Разнообразие</span><i><b style={{width:"76%"}}/></i><strong>Хорошо</strong></div><button>Изменить условия <SiteIcon name="arrow" size={15}/></button></div>
      </div>
    </section>

    <section className="eat-swap page-section"><div className="shell eat-swap-grid">
      <div><PageIntro eyebrow="Свободный выбор" icon="recipe" title={<>Не нравится ингредиент?<br/><em>Замените — день пересчитается.</em></>} text="Любой компонент можно заменить на любимый, более доступный или уже имеющийся дома. JIVELO обновит порцию и влияние на остаток дня." align="center"/></div>
      <div className="swap-card"><div className="swap-head"><span>Замена ингредиента</span><b>Боул с курицей</b></div><article><div className="ingredient-photo chicken"/><span><small>БЫЛО</small><b>Куриная грудка · 160 г</b></span><strong>264 ккал</strong></article><i className="swap-arrow">↓</i><article className="new"><div className="ingredient-photo turkey"/><span><small>СТАЛО</small><b>Индейка · 170 г</b></span><strong>238 ккал</strong></article><footer><span>Новый итог</span><b>598 ккал · 44 г белка</b></footer></div>
    </div></section>

    <section className="shell page-section">
      <PageIntro eyebrow="Управляемая персонализация" icon="shield" title={<>Ваши ограничения<br/><em>сначала, генерация — потом.</em></>} text="Аллергии, исключения, цели и правила специалиста применяются детерминированно. AI не может обойти эти ограничения ради красивой идеи."/>
      <FeatureGrid items={[
        { icon: "shield", title: "Аллергии и исключения", text: "Неподходящие продукты не попадают в рекомендации и замены." },
        { icon: "target", title: "Диапазоны, а не догмы", text: "Вариант должен вписаться в безопасный диапазон, а не попасть в одну идеальную цифру." },
        { icon: "users", title: "Правила специалиста", text: "Назначенные цели и ограничения учитываются до генерации объяснения." },
        { icon: "leaf", title: "Без медицинских обещаний", text: "JIVELO помогает с выбором еды, но не диагностирует и не назначает лечение." },
      ]}/>
    </section>

    <PageCta eyebrow="Ответьте на вопрос дня" title={<>Что вам действительно<br/><em>подойдёт сейчас?</em></>} text="В раннем доступе JIVELO научится подбирать варианты на основе ваших любимых продуктов и реального ритма." button="Подобрать первый вариант"/>
  </main>;
}

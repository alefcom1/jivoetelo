import type { Metadata } from "next";
import { FeatureGrid, PageCta, PageHero, PageIntro } from "../components/marketing-sections";
import { Brand, SiteIcon } from "../components/site-chrome";

export const metadata: Metadata = {
  title: "Продукт",
  description: "Как JIVELO превращает запись еды, дневной баланс и прогресс в понятный следующий шаг.",
};

export default function ProductPage() {
  return <main className="inner-page product-page">
    <PageHero
      eyebrow="Продукт JIVELO"
      icon="leaf"
      title="Весь день питания"
      accent="в одном спокойном интерфейсе."
      text="Добавляйте еду естественным способом, понимайте качество оценки и получайте только тот следующий шаг, который полезен именно сегодня."
      secondary="Посмотреть AI-камеру"
      secondaryHref="/ai-food-camera"
      visual={<div className="product-hero-app">
        <aside><Brand/><span className="active">Сегодня</span><span>Дневник</span><span>План</span><span>Прогресс</span></aside>
        <div className="product-hero-content">
          <div className="mini-date"><small>СРЕДА · 18 ИЮНЯ</small><b>Добрый день, Марина.</b><i>+</i></div>
          <div className="mini-balance"><span><small>ОСТАЛОСЬ СЕГОДНЯ</small><strong>684 <i>ккал</i></strong></span><div><b>38 г<small>белка</small></b><b>9 г<small>клетчатки</small></b><b>0,6 л<small>воды</small></b></div></div>
          <div className="mini-timeline"><article><time>08:15</time><i/><span><b>Завтрак</b>Яйца, гречка, зелень</span><strong>468</strong></article><article><time>13:24</time><i/><span><b>Обед</b>Лосось и овощи</span><strong>548</strong></article><article className="suggest"><SiteIcon name="spark"/><span><small>СЛЕДУЮЩИЙ ШАГ</small><b>Подобрать ужин на 600–700 ккал</b></span></article></div>
        </div>
      </div>}
    />

    <section className="shell page-section" id="multimodal">
      <PageIntro eyebrow="Один дневник — любой способ" icon="voice" title={<>Записывайте так,<br/><em>как удобно сейчас.</em></>} text="Не нужно каждый раз искать продукт в длинной базе. JIVELO принимает фотографию, голос, обычную фразу, штрихкод или повтор знакомого блюда."/>
      <div className="input-showcase">
        <article className="input-photo"><div><SiteIcon name="camera"/><span>Фото</span></div><b>Снимок превращается<br/>в редактируемое блюдо</b><i className="focus-frame"/></article>
        <article className="input-voice"><div><SiteIcon name="voice"/><span>Голос</span></div><blockquote>«Два сырника, ложка сметаны и капучино без сахара»</blockquote><div className="wave"><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></article>
        <article className="input-text"><div><span>Aa</span><span>Текст</span></div><p>200 г гречки, куриная грудка, салат и чай с молоком</p><small><SiteIcon name="check" size={14}/> 4 компонента распознаны</small></article>
        <article className="input-repeat"><div><SiteIcon name="arrow"/><span>Повтор</span></div><b>Завтрак как вчера</b><p>Одно касание — и сохранённая порция уже в дневнике.</p></article>
      </div>
    </section>

    <section className="product-quality page-section" id="quality"><div className="shell quality-grid">
      <div className="quality-copy"><PageIntro eyebrow="Доверие к цифрам" icon="shield" title={<>Не скрываем,<br/><em>откуда взялась оценка.</em></>} text="У каждого продукта есть источник, состояние и уровень уверенности. Пользователь понимает, где данные точные, а где лучше уточнить порцию или способ приготовления." align="center"/></div>
      <div className="source-stack">
        <article><span className="source-icon verified"><SiteIcon name="check"/></span><div><small>ДАННЫЕ ПРОИЗВОДИТЕЛЯ</small><b>Творог 5% · 180 г</b><p>Этикетка распознана и сопоставлена с брендом.</p></div><strong>218 ккал</strong></article>
        <article><span className="source-icon expert"><SiteIcon name="shield"/></span><div><small>ПРОВЕРЕНО ЭКСПЕРТОМ</small><b>Гречка варёная · 150 г</b><p>Проверенная базовая запись с учётом готового веса.</p></div><strong>165 ккал</strong></article>
        <article><span className="source-icon estimate"><SiteIcon name="spark"/></span><div><small>AI-ОЦЕНКА · НУЖНО УТОЧНИТЬ</small><b>Домашняя запеканка</b><p>Состав понятен, но жирность и сахар заметно влияют на итог.</p></div><button>Уточнить</button></article>
      </div>
    </div></section>

    <section className="shell page-section" id="progress">
      <PageIntro eyebrow="Картина дня" icon="chart" title={<>Цифры не спорят<br/><em>за ваше внимание.</em></>} text="Главный экран показывает три вещи: состояние дня, следующий полезный шаг и быстрый способ добавить еду. Остальная аналитика остаётся рядом, но не создаёт шум."/>
      <FeatureGrid className="product-feature-grid" items={[
        { icon: "target", title: "Состояние дня", text: "Энергия, белок, клетчатка и вода собраны в понятную картину без десятка цветных колец." },
        { icon: "spark", title: "Один главный совет", text: "JIVELO выбирает наиболее полезное действие и объясняет, почему предлагает именно его." },
        { icon: "chart", title: "Тренд вместо шума", text: "Вес, питание и самочувствие рассматриваются в динамике, а не как экзамен каждого дня." },
        { icon: "leaf", title: "Спокойный режим", text: "Можно скрыть калории и оставить фокус на регулярности, качестве еды и самочувствии." },
      ]}/>
    </section>

    <section className="shell ecosystem page-section">
      <div className="ecosystem-copy"><PageIntro eyebrow="Одна платформа" icon="users" title={<>Веб сегодня.<br/><em>Telegram и специалист — рядом.</em></>} text="Сайт, будущий Telegram Mini App и JIVELO Pro работают с одним профилем, дневником и системой разрешений." align="center"/></div>
      <div className="ecosystem-orbit"><div className="eco-core"><Brand/><small>Единый профиль и данные</small></div><span className="eco web">Web SaaS</span><span className="eco telegram">Telegram</span><span className="eco pro-label">JIVELO Pro</span><span className="eco health">Health data</span><i/><i/></div>
    </section>

    <PageCta title={<>Питание становится проще,<br/><em>когда интерфейс думает вместе с вами.</em></>} text="Начните с базового дневника и подключайте AI-навигацию, когда будете готовы."/>
  </main>;
}

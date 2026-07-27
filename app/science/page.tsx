import type { Metadata } from "next";
import { PageCta, PageHero, PageIntro } from "../components/marketing-sections";
import { SiteIcon } from "../components/site-chrome";

export const metadata: Metadata = {
  title: "Методология",
  description: "Как JIVELO рассчитывает стартовые цели, показывает тренд, оценивает фото и формирует рекомендации.",
};

export default function SciencePage() {
  return <main className="inner-page science-page">
    <PageHero
      eyebrow="Методология JIVELO"
      icon="book"
      title="Красивый интерфейс"
      accent="должен опираться на честные правила."
      text="Здесь мы объясняем, как формируются стартовые цели, почему вес показывается трендом, что означает уверенность AI и где заканчиваются возможности сервиса."
      primary="Создать стартовый план"
      secondary="Ограничения AI"
      secondaryHref="#limits"
      visual={<div className="science-hero-visual">
        <div className="science-formula"><small>СТАРТОВАЯ МОДЕЛЬ</small><strong>Профиль + активность + цель</strong><i>→</i><b>Диапазон, а не одна цифра</b></div>
        <div className="science-trend"><small>РЕАЛЬНАЯ ДИНАМИКА</small><svg viewBox="0 0 430 150"><path d="M10 35C65 42 95 59 130 65S215 88 255 96 345 122 420 132"/></svg><span>Тренд уточняет план</span></div>
        <div className="science-confidence"><span><SiteIcon name="shield"/></span><div><small>УВЕРЕННОСТЬ AI</small><b>Высокая · средняя · уточнить</b></div></div>
      </div>}
    />

    <section className="shell page-section science-toc">
      <PageIntro eyebrow="Что можно проверить" icon="book" title={<>Не обещания,<br/><em>а открытая логика.</em></>} text="Методология разбита на понятные части. По мере развития продукта здесь появятся версии алгоритмов, дата обновления и источники."/>
      <div className="science-nav-grid"><a href="#targets"><span>01</span><b>Стартовые цели</b><SiteIcon name="arrow" size={16}/></a><a href="#trend"><span>02</span><b>Тренд веса</b><SiteIcon name="arrow" size={16}/></a><a href="#adaptive"><span>03</span><b>Адаптивная модель</b><SiteIcon name="arrow" size={16}/></a><a href="#vision"><span>04</span><b>AI-камера</b><SiteIcon name="arrow" size={16}/></a><a href="#recommend"><span>05</span><b>Рекомендации</b><SiteIcon name="arrow" size={16}/></a><a href="#limits"><span>06</span><b>Ограничения</b><SiteIcon name="arrow" size={16}/></a></div>
    </section>

    <section className="method-section page-section" id="targets"><div className="shell method-grid"><div className="method-number">01</div><div><PageIntro eyebrow="Стартовые цели" icon="target" title={<>Первая оценка —<br/><em>отправная точка.</em></>} text="Стартовый диапазон формируется по базовым параметрам, выбранному уровню активности и цели. JIVELO сохраняет версию формулы и использованные допущения." align="center"/><div className="method-cards"><article><small>ВХОДНЫЕ ДАННЫЕ</small><b>Возраст · рост · вес</b><p>Только параметры, необходимые для расчёта.</p></article><article><small>КОНТЕКСТ</small><b>Активность и цель</b><p>Уровень активности объясняется примерами, а не абстрактным коэффициентом.</p></article><article><small>РЕЗУЛЬТАТ</small><b>Безопасный диапазон</b><p>Пользователь видит не одну магическую цифру, а рабочую область.</p></article></div></div></div></section>

    <section className="shell method-section page-section" id="trend"><div className="method-grid reverse"><div className="method-number">02</div><div><PageIntro eyebrow="Тренд веса" icon="chart" title={<>Ежедневная цифра шумит.<br/><em>Направление — важнее.</em></>} text="Вода, соль, пищеварение и тренировка могут временно изменить вес. Поэтому интерфейс сохраняет реальные измерения, но визуально приоритизирует сглаженную динамику." align="center"/><div className="science-chart-card"><header><span>ДНЕВНЫЕ ИЗМЕРЕНИЯ</span><b>ПЛАВНЫЙ ТРЕНД</b></header><div className="science-chart-dots">{[32,45,39,55,48,60,57,66,62,72,68,77,75,83].map((top,index)=><i style={{top:`${top}%`,left:`${index*7.3}%`}} key={index}/>)}</div><svg viewBox="0 0 650 230"><path d="M15 50C75 57 105 69 145 79S240 99 290 112 390 140 455 158 550 184 635 200"/></svg><p>Тренд помогает оценивать направление без эмоциональной реакции на одно измерение.</p></div></div></div></section>

    <section className="method-section page-section" id="adaptive"><div className="shell method-grid"><div className="method-number">03</div><div><PageIntro eyebrow="Адаптивная модель" icon="spark" title={<>Корректировка появляется<br/><em>только при достаточных данных.</em></>} text="Питание сравнивается с трендом веса и самочувствием. Неполный дневник снижает уверенность, а один необычный день не меняет цель." align="center"/><div className="adaptive-rules"><article><span><SiteIcon name="check"/></span><div><b>Достаточная полнота</b><p>Нужно достаточно записей питания и измерений веса.</p></div></article><article><span><SiteIcon name="chart"/></span><div><b>Устойчивое изменение</b><p>Система ищет тренд, а не реагирует на одиночный скачок.</p></div></article><article><span><SiteIcon name="leaf"/></span><div><b>Самочувствие имеет значение</b><p>Голод и энергия помогают понять, не слишком ли агрессивен план.</p></div></article><article><span><SiteIcon name="shield"/></span><div><b>Безопасные границы</b><p>Автоматическая рекомендация не должна вести к экстремальным значениям.</p></div></article></div></div></div></section>

    <section className="shell method-section page-section" id="vision"><div className="method-grid reverse"><div className="method-number">04</div><div><PageIntro eyebrow="AI-камера" icon="camera" title={<>Фотография даёт оценку.<br/><em>Не абсолютную истину.</em></>} text="Видимые компоненты и простые блюда распознаются увереннее. Скрытые масла, соусы, сахар и состав смешанных блюд требуют уточнения." align="center"/><div className="vision-method-table"><div><b>Фактор</b><b>Что происходит</b><b>Как показывает JIVELO</b></div><div><span>Компонент хорошо виден</span><span>Надёжное сопоставление</span><em>Высокая уверенность</em></div><div><span>Порция частично скрыта</span><span>Используется диапазон</span><em>Средняя уверенность</em></div><div><span>Состав нельзя увидеть</span><span>Требуется ответ пользователя</span><em>Нужно уточнить</em></div><div><span>Нет подходящей записи</span><span>Черновик без сохранения</span><em>Проверьте продукт</em></div></div></div></div></section>

    <section className="method-section page-section" id="recommend"><div className="shell method-grid"><div className="method-number">05</div><div><PageIntro eyebrow="Рекомендации" icon="recipe" title={<>Сначала ограничения.<br/><em>Потом — красивое объяснение.</em></>} text="Аллергии, исключения, диапазон питания, продукты дома и правила специалиста применяются до генерации текста. AI не должен придумывать пищевую ценность." align="center"/><div className="recommend-pipeline"><article><span>1</span><b>Безопасность</b><p>Аллергии и ограничения</p></article><SiteIcon name="arrow"/><article><span>2</span><b>Фактический контекст</b><p>Баланс дня и продукты</p></article><SiteIcon name="arrow"/><article><span>3</span><b>Ранжирование</b><p>Польза, удобство, привычки</p></article><SiteIcon name="arrow"/><article><span>4</span><b>Объяснение</b><p>Почему этот вариант подходит</p></article></div></div></div></section>

    <section className="limits-section page-section" id="limits"><div className="shell limits-grid">
      <div><PageIntro eyebrow="Границы продукта" icon="shield" title={<>JIVELO помогает с питанием.<br/><em>Но не заменяет медицину.</em></>} text="Мы сознательно отделяем полезную навигацию от диагностики, лечения и обещаний результата." align="center"/></div>
      <div className="limits-list"><article><span>Не делает</span><h3>Не ставит диагноз</h3><p>Сервис не интерпретирует симптомы как заболевание.</p></article><article><span>Не делает</span><h3>Не назначает лечение</h3><p>Медицинские диеты и терапия остаются задачей квалифицированного специалиста.</p></article><article><span>Не обещает</span><h3>Не гарантирует срок результата</h3><p>Прогноз показывается диапазоном и зависит от множества факторов.</p></article><article><span>Не скрывает</span><h3>Не выдаёт приблизительность за точность</h3><p>AI-оценки и ограничения интерфейса объясняются пользователю.</p></article></div>
    </div></section>

    <section className="shell page-section sources-section">
      <PageIntro eyebrow="Источники и версии" icon="book" title={<>Методология будет<br/><em>обновляться публично.</em></>} text="Перед запуском здесь появятся конкретные формулы, исследования, пищевые базы, даты проверки и журнал изменений."/>
      <div className="source-docs"><article><span>v0.1</span><div><b>Стартовая энергетическая модель</b><p>Описание входных данных, формулы и безопасных ограничений.</p></div><button>Готовится</button></article><article><span>v0.1</span><div><b>Метод сглаживания тренда веса</b><p>Как ежедневные измерения превращаются в устойчивую линию.</p></div><button>Готовится</button></article><article><span>v0.1</span><div><b>Калибровка уверенности JIVELO Vision</b><p>Как тестируется фотооценка и какие блюда считаются сложными.</p></div><button>Готовится</button></article></div>
    </section>

    <PageCta eyebrow="Понятная система вместо магии" title={<>Пользуйтесь рекомендациями,<br/><em>понимая их происхождение.</em></>} text="Создайте стартовый план и следите за тем, как JIVELO объясняет каждый следующий шаг." button="Создать свой план"/>
  </main>;
}

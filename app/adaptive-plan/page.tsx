import type { Metadata } from "next";
import { FeatureGrid, PageCta, PageHero, PageIntro } from "../components/marketing-sections";
import { SiteIcon } from "../components/site-chrome";

export const metadata: Metadata = {
  title: "Адаптивный план",
  description: "Как JIVELO уточняет цели по реальной динамике веса, питания, активности и самочувствия.",
};

export default function AdaptivePlanPage() {
  return <main className="inner-page adaptive-page">
    <PageHero
      eyebrow="Адаптивная энергетическая модель"
      icon="chart"
      title="Формула даёт старт."
      accent="Ваше тело уточняет план."
      text="JIVELO постепенно сравнивает питание с плавным трендом веса и предлагает небольшие, объяснимые корректировки вместо жёстких пересчётов."
      secondary="Посмотреть недельный цикл"
      secondaryHref="#weekly"
      visual={<div className="adaptive-hero-chart">
        <div className="adaptive-hero-head"><div><small>ТРЕНД ЗА 8 НЕДЕЛЬ</small><b>Устойчивое снижение</b></div><span>−2,8 кг</span></div>
        <svg viewBox="0 0 660 290" aria-label="График плавного снижения веса"><defs><linearGradient id="adaptiveFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2946c6" stopOpacity=".30"/><stop offset="1" stopColor="#2946c6" stopOpacity="0"/></linearGradient></defs><path className="grid" d="M30 45H630M30 105H630M30 165H630M30 225H630"/><path className="adaptive-band" d="M30 58C105 72 125 92 190 101S290 138 350 147 450 183 515 192 580 211 630 218L630 248C570 238 530 226 485 218S395 188 340 177 235 142 180 130 92 100 30 91Z"/><path className="adaptive-line" d="M30 74C100 82 133 105 190 113S286 148 347 158 445 190 510 201 575 218 630 226"/><g className="adaptive-points"><circle cx="30" cy="74" r="5"/><circle cx="190" cy="113" r="5"/><circle cx="347" cy="158" r="5"/><circle cx="510" cy="201" r="5"/><circle cx="630" cy="226" r="5"/></g></svg>
        <div className="adaptive-proposal"><span><SiteIcon name="spark"/></span><div><small>НОВАЯ РЕКОМЕНДАЦИЯ</small><b>Добавить 120 ккал</b><p>Темп немного быстрее плана, вечерний голод вырос.</p></div><button>Рассмотреть</button></div>
      </div>}
    />

    <section className="shell page-section">
      <PageIntro eyebrow="Старт без ложной точности" icon="target" title={<>Сначала — безопасный диапазон.<br/><em>Не магическая идеальная цифра.</em></>} text="Стартовая оценка учитывает базовые параметры, активность и цель. JIVELO сохраняет используемую формулу и объясняет допущения."/>
      <div className="starting-model">
        <div className="model-inputs"><article><small>ПРОФИЛЬ</small><b>Марина · 37 лет</b><p>168 см · 74,2 кг</p></article><article><small>РИТМ</small><b>Умеренная активность</b><p>7 000–9 000 шагов</p></article><article><small>ЦЕЛЬ</small><b>Мягкое снижение</b><p>Без экстремального дефицита</p></article></div>
        <div className="model-arrow"><SiteIcon name="arrow" size={24}/></div>
        <div className="model-output"><span>СТАРТОВЫЙ ДИАПАЗОН</span><strong>1 950–2 100<small>ккал в день</small></strong><div><b>Белок 95–115 г</b><b>Клетчатка 25+ г</b></div><p><SiteIcon name="shield" size={15}/> План остаётся рекомендацией и требует подтверждения.</p></div>
      </div>
    </section>

    <section className="weekly-section page-section" id="weekly"><div className="shell">
      <PageIntro eyebrow="Недельный цикл" icon="chart" title={<>JIVELO смотрит на связь,<br/><em>а не на один случайный день.</em></>} text="Достаточно данных — и система готовит понятный обзор. Недостаточно — честно ждёт, не делая громких выводов."/>
      <div className="weekly-flow">
        <article><span>01</span><SiteIcon name="recipe"/><h3>Питание</h3><p>Среднее потребление и полнота дневника.</p><b>6 из 7 дней</b></article>
        <article><span>02</span><SiteIcon name="chart"/><h3>Тренд веса</h3><p>Сглаженная динамика вместо дневных скачков.</p><b>−0,6 кг / нед.</b></article>
        <article><span>03</span><SiteIcon name="leaf"/><h3>Самочувствие</h3><p>Голод, энергия, стресс и сон.</p><b>Голод вечером ↑</b></article>
        <article className="weekly-result"><span><SiteIcon name="spark"/></span><small>ВЫВОД НЕДЕЛИ</small><h3>Темп быстрее запланированного</h3><p>Увеличить питание на 100–150 ккал, преимущественно днём.</p><button>Применить после подтверждения</button></article>
      </div>
    </div></section>

    <section className="shell page-section adaptive-explain">
      <div><PageIntro eyebrow="Понятные причины" icon="book" title={<>Каждое изменение<br/><em>можно объяснить словами.</em></>} text="Вместо «алгоритм так решил» JIVELO показывает данные, которые повлияли на рекомендацию, и уровень уверенности." align="center"/></div>
      <div className="explain-card"><header><span><SiteIcon name="spark"/></span><div><small>ПОЧЕМУ ЦЕЛЬ ИЗМЕНИЛАСЬ</small><h3>Рекомендация: +120 ккал</h3></div><em>Уверенность: средняя</em></header><section><article><b>1</b><span><strong>Вес менялся быстрее цели</strong><p>Сглаженный темп: −0,6 кг в неделю при плане −0,3–0,5 кг.</p></span></article><article><b>2</b><span><strong>Вечерний голод вырос</strong><p>Средняя отметка голода повысилась с 2,8 до 4,1 из 5.</p></span></article><article><b>3</b><span><strong>Данных достаточно, но не идеально</strong><p>Заполнено 6 дней питания и 4 измерения веса.</p></span></article></section><footer><button>Оставить текущий план</button><button className="primary">Принять изменение</button></footer></div>
    </section>

    <section className="adaptive-safety page-section"><div className="shell">
      <PageIntro eyebrow="Защитные ограничения" icon="shield" title={<>Алгоритм не должен<br/><em>подталкивать к крайностям.</em></>} text="Корректировки ограничены безопасными правилами, а чувствительные состояния требуют отдельного режима или работы со специалистом."/>
      <FeatureGrid items={[
        { icon: "shield", title: "Нижние границы", text: "Автоматический план не уходит в экстремально низкую калорийность." },
        { icon: "target", title: "Небольшой шаг", text: "Корректировки происходят постепенно и не реагируют на один день." },
        { icon: "users", title: "Специальные состояния", text: "Беременность, кормление и несовершеннолетний возраст требуют отдельного безопасного сценария." },
        { icon: "check", title: "Только с подтверждением", text: "Новая цель показывается как предложение и не меняется молча." },
      ]}/>
    </div></section>

    <section className="shell page-section trend-vs-scale">
      <div className="trend-copy"><PageIntro eyebrow="Вес без паники" icon="chart" title={<>Весы показывают шум.<br/><em>Тренд показывает направление.</em></>} text="Соль, вода, поздний ужин и тренировка могут изменить цифру на весах. JIVELO оставляет дневные точки, но визуально приоритизирует плавную линию." align="center"/></div>
      <div className="trend-demo"><div className="trend-dots">{[52,47,58,49,61,55,64,60,70,66,73,72,78,75,82,80].map((x,i)=><i style={{top:`${x}%`,left:`${i*6.3}%`}} key={i}/>)}</div><svg viewBox="0 0 620 230"><path d="M20 70C90 82 120 90 170 102S270 125 330 139 420 163 485 178 555 193 605 202"/></svg><span className="trend-label start">74,2 кг</span><span className="trend-label end">71,4 кг</span></div>
    </section>

    <PageCta eyebrow="План меняется вместе с данными" title={<>Не подстраивайте тело<br/><em>под усреднённую таблицу.</em></>} text="JIVELO начнёт со спокойного диапазона и будет уточнять рекомендации только тогда, когда данных действительно достаточно." button="Создать стартовый план"/>
  </main>;
}

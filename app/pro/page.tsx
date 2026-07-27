import type { Metadata } from "next";
import { FeatureGrid, PageCta, PageHero, PageIntro } from "../components/marketing-sections";
import { Brand, SiteIcon } from "../components/site-chrome";

export const metadata: Metadata = {
  title: "JIVELO Pro",
  description: "SaaS для нутрициологов, тренеров и клиник: клиенты, дневники, цели, сообщения и отчёты.",
};

export default function ProPage() {
  return <main className="inner-page pro-page">
    <PageHero
      theme="blue"
      eyebrow="JIVELO Pro"
      icon="users"
      title="Меньше таблиц."
      accent="Больше времени на клиента."
      text="Дневник, фотографии, цели, самочувствие, сообщения и недельные обзоры собраны в одном спокойном рабочем пространстве."
      primary="Запросить доступ Pro"
      secondary="Посмотреть интерфейс"
      secondaryHref="#workspace"
      visual={<div className="pro-hero-window">
        <header><Brand/><span>Сегодня · 12 клиентов</span><i>АН</i></header>
        <div className="pro-hero-body"><aside><b>Обзор</b><span>Клиенты</span><span>Сообщения</span><span>Отчёты</span></aside><section><div className="pro-welcome"><small>КЛИЕНТЫ, ТРЕБУЮЩИЕ ВНИМАНИЯ</small><h3>Добрый день, Анна.</h3><button>+ Пригласить</button></div><div className="pro-client-row"><i>АМ</i><span><b>Алина М.</b><small>Повышенный вечерний голод</small></span><em>Посмотреть</em><strong>+12%</strong></div><div className="pro-client-row"><i>ИС</i><span><b>Ирина С.</b><small>Недельный обзор готов</small></span><em className="stable">На плане</em><strong>84%</strong></div><div className="pro-client-row"><i>ВН</i><span><b>Виктория Н.</b><small>Последняя запись 2 часа назад</small></span><em className="stable">Стабильно</em><strong>−0,4 кг</strong></div></section></div>
      </div>}
    />

    <section className="shell page-section" id="workspace">
      <PageIntro eyebrow="Рабочий день специалиста" icon="users" title={<>Сначала — кому нужна поддержка.<br/><em>Потом — все остальные данные.</em></>} text="Главный экран не заставляет просматривать каждого клиента вручную. Он показывает изменения, вопросы и готовые обзоры."/>
      <div className="pro-dashboard-showcase">
        <aside><Brand/><nav><b>Обзор</b><span>Клиенты <i>12</i></span><span>Группы</span><span>Программы</span><span>Сообщения <i>3</i></span><span>Отчёты</span></nav><small>JIVELO PRO</small></aside>
        <div className="pro-dashboard-main"><header><div><small>ПОНЕДЕЛЬНИК · 24 ИЮНЯ</small><h3>Ваш рабочий обзор</h3></div><button>+ Пригласить клиента</button></header><section className="pro-summary"><article><small>АКТИВНЫЕ КЛИЕНТЫ</small><b>28</b><span>+4 за месяц</span></article><article><small>НУЖНО ПОСМОТРЕТЬ</small><b>6</b><span>2 новых сообщения</span></article><article><small>ОБЗОРЫ НА НЕДЕЛЕ</small><b>12</b><span>7 уже готовы</span></article></section><div className="attention-list"><h4>Требуют внимания</h4><article><i>АК</i><span><b>Алексей К.</b><small>Тренд меняется быстрее цели</small></span><em>Динамика</em><button>Открыть</button></article><article><i>ОМ</i><span><b>Ольга М.</b><small>Вопрос по новому плану</small></span><em>Сообщение</em><button>Ответить</button></article><article><i>ЕС</i><span><b>Елена С.</b><small>Нет записей 5 дней</small></span><em>Активность</em><button>Посмотреть</button></article></div></div>
      </div>
    </section>

    <section className="pro-client-profile page-section"><div className="shell">
      <PageIntro eyebrow="Карточка клиента" icon="target" title={<>Контекст рядом.<br/><em>Не в пяти разных сервисах.</em></>} text="Дневник, прогресс, цели и заметки находятся в одной карточке. Специалист видит тенденцию и может открыть детали только при необходимости."/>
      <div className="client-profile-window">
        <header><div className="client-person"><i>АМ</i><span><h3>Алина Мартынова</h3><p>Мягкое снижение веса · 7 недель</p></span></div><nav><b>Обзор</b><span>Дневник</span><span>Прогресс</span><span>Цели</span><span>Сообщения</span></nav><button>Написать</button></header>
        <div className="client-profile-grid"><article className="client-trend"><small>ТРЕНД ВЕСА</small><strong>−2,4 кг</strong><svg viewBox="0 0 420 140"><path d="M10 35C65 48 85 51 120 62S190 78 225 88 300 105 410 122"/></svg><p>Темп в целевом диапазоне</p></article><article className="client-focus"><small>ФОКУС НЕДЕЛИ</small><span><SiteIcon name="leaf"/></span><h3>Регулярный обед</h3><p>5 из 7 дней · лучше, чем неделей ранее</p></article><article className="client-meals"><small>СЕГОДНЯ</small><div><time>08:10</time><i/><span><b>Завтрак</b>Омлет и хлеб</span><strong>412</strong></div><div><time>13:02</time><i/><span><b>Обед</b>Курица, рис, салат</span><strong>586</strong></div><button>Открыть дневник <SiteIcon name="arrow" size={15}/></button></article><article className="client-note"><small>AI-СВОДКА</small><h3>Вечерний голод снизился</h3><p>После переноса части калорий на обед средняя отметка голода изменилась с 4,2 до 3,1.</p><button>Добавить заметку</button></article></div>
      </div>
    </div></section>

    <section className="shell page-section">
      <PageIntro eyebrow="Основные возможности" icon="spark" title={<>Всё необходимое<br/><em>для спокойного сопровождения.</em></>} text="Начинаем с самого ценного: наблюдение за динамикой, понятные цели, сообщения и отчёты. Без перегруженной CRM внутри продукта."/>
      <FeatureGrid className="pro-feature-grid" items={[
        { icon: "users", title: "Клиенты и группы", text: "Фильтры по статусу, цели, специалисту и следующему обзору." },
        { icon: "recipe", title: "Дневник и фотографии", text: "Комментарии к приёмам пищи и быстрый переход к составу блюда." },
        { icon: "target", title: "Общие цели", text: "Диапазоны, нутриенты, привычки и дата начала нового плана." },
        { icon: "chart", title: "Недельные обзоры", text: "Красивый отчёт с трендом, основными изменениями и следующим фокусом." },
        { icon: "book", title: "Программы и шаблоны", text: "Повторно используемые задачи, материалы, рецепты и check-in." },
        { icon: "shield", title: "Контроль доступа", text: "Клиент видит, кто имеет доступ, и может отозвать его в любой момент." },
      ]}/>
    </section>

    <section className="pro-report-section page-section"><div className="shell pro-report-grid">
      <div><PageIntro eyebrow="Отчёт, который хочется прочитать" icon="book" title={<>Не выгрузка таблицы.<br/><em>История недели.</em></>} text="Автоматическая сводка собирает самое важное, но специалист сохраняет контроль над выводами и финальными рекомендациями." align="center"/><ul><li><SiteIcon name="check" size={15}/>Основной результат и контекст</li><li><SiteIcon name="check" size={15}/>Питание, тренд и самочувствие</li><li><SiteIcon name="check" size={15}/>Комментарий специалиста</li><li><SiteIcon name="check" size={15}/>PDF и защищённая ссылка</li></ul></div>
      <div className="report-sheet"><header><Brand/><span>НЕДЕЛЬНЫЙ ОБЗОР · 17–23 ИЮНЯ</span></header><h3>Неделя устойчивого ритма</h3><p>Тренд веса продолжил плавное снижение. Обед стал регулярнее, а вечерний голод уменьшился.</p><div className="report-metrics"><span><b>−0,4 кг</b>тренд</span><span><b>6/7</b>дней</span><span><b>94 г</b>белка</span></div><section><small>ФОКУС СЛЕДУЮЩЕЙ НЕДЕЛИ</small><b>Сохранять полноценный обед минимум 5 дней</b></section><footer>Комментарий Анны · специалиста JIVELO Pro</footer></div>
    </div></section>

    <section className="shell page-section" id="teams">
      <PageIntro eyebrow="Для клиник и команд" icon="users" title={<>Один стандарт работы.<br/><em>Несколько специалистов.</em></>} text="Организации смогут распределять клиентов, использовать общие шаблоны, видеть загрузку и формировать брендированные отчёты."/>
      <div className="teams-board"><div className="team-org"><span className="team-logo">N</span><div><small>КЛИНИКА NUTRIMA</small><b>4 специалиста · 86 клиентов</b></div><button>Настройки</button></div><div className="team-members"><article><i>АВ</i><span><b>Анна В.</b><small>24 клиента</small></span><em>Администратор</em></article><article><i>ЕК</i><span><b>Елена К.</b><small>19 клиентов</small></span><em>Специалист</em></article><article><i>МС</i><span><b>Мария С.</b><small>22 клиента</small></span><em>Специалист</em></article><article><i>ОВ</i><span><b>Ольга В.</b><small>21 клиент</small></span><em>Специалист</em></article></div><div className="team-stats"><span><b>92%</b>активных клиентов</span><span><b>18</b>обзоров на неделе</span><span><b>4,8</b>средняя оценка</span></div></div>
    </section>

    <PageCta eyebrow="Откройте ранний доступ Pro" title={<>Меньше ручной рутины.<br/><em>Больше человеческой работы.</em></>} text="Оставьте заявку для специалиста, клиники или онлайн-школы. Мы пригласим первые команды в закрытый запуск." button="Запросить JIVELO Pro"/>
  </main>;
}

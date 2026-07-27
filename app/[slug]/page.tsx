import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageCta, PageEyebrow, PageHero, PageIntro } from "../components/marketing-sections";
import { Brand, SiteIcon } from "../components/site-chrome";

const supported = ["recipes", "articles", "security", "privacy", "terms", "contact", "login", "register"];

const titles: Record<string, string> = {
  recipes: "Рецепты",
  articles: "Журнал",
  security: "Безопасность",
  privacy: "Конфиденциальность",
  terms: "Условия использования",
  contact: "Контакты",
  login: "Вход",
  register: "Регистрация",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: titles[slug] ?? "JIVELO" };
}

const recipeCards = [
  ["Боул с курицей и булгуром", "18 минут · 624 ккал · 42 г белка", "recipe-one"],
  ["Лосось, киноа и зелёные овощи", "25 минут · 658 ккал · 39 г белка", "recipe-two"],
  ["Сырники с ягодами и йогуртом", "15 минут · 418 ккал · 28 г белка", "recipe-three"],
  ["Тёплый салат с индейкой", "20 минут · 536 ккал · 41 г белка", "recipe-four"],
  ["Завтрак без готовки", "5 минут · 382 ккал · 24 г белка", "recipe-five"],
  ["Семейная овощная паста", "30 минут · гибкие порции", "recipe-six"],
];

function Recipes() {
  return <>
    <PageHero eyebrow="Рецепты JIVELO" icon="recipe" title="Не идеальная еда." accent="Подходящая вашему дню." text="Рецепты показывают не только калории, но и место блюда в дневном плане, возможные замены и семейные порции." primary="Получить ранний доступ" visual={<div className="recipes-hero"><div className="recipe-hero-photo"/><div className="recipe-hero-card"><small>ЛУЧШИЙ УЖИН СЕГОДНЯ</small><h3>Лосось, киноа и овощи</h3><p>Подходит по белку · 25 минут</p><strong>658 <i>ккал</i></strong><span><b>39 г</b> белка · <b>11 г</b> клетчатки</span></div></div>}/>
    <section className="shell page-section"><PageIntro eyebrow="Подборка недели" icon="leaf" title={<>Красивые блюда,<br/><em>которые реально приготовить.</em></>} text="Знакомые ингредиенты, понятные порции и варианты без готовки — без фитнес-клише и списка из двадцати редких продуктов."/><div className="recipe-catalog">{recipeCards.map(([name,meta,cls])=><article key={name}><div className={cls}><button aria-label="Добавить в избранное">♡</button></div><small>JIVELO РЕЦЕПТ</small><h3>{name}</h3><p>{meta}</p><Link href="/register">Добавить в план <SiteIcon name="arrow" size={15}/></Link></article>)}</div></section>
    <section className="recipe-filter-section page-section"><div className="shell"><PageIntro eyebrow="Под ваш контекст" icon="target" title={<>Фильтры не по модной диете,<br/><em>а по реальной ситуации.</em></>} text="Время, продукты дома, бюджет, белок, семейная порция и режим «ничего не готовить»."/><div className="recipe-filters"><span>До 15 минут</span><span>Много белка</span><span>Без готовки</span><span>Из продуктов дома</span><span>Для семьи</span><span>До 500 ₽</span><span>Вегетарианское</span><span>В избранном</span></div></div></section>
    <PageCta title={<>Не ищите рецепт.<br/><em>Получите подходящий вариант.</em></>} text="В JIVELO рецепты будут подстраиваться под дневной баланс и продукты, которые вы действительно используете." button="Открыть ранний доступ"/>
  </>;
}

function Articles() {
  const articles = [
    ["Понимание", "Почему тренд веса важнее цифры сегодня", "8 минут", "article-one"],
    ["Практика", "Как собрать сытный обед без сложных правил", "6 минут", "article-two"],
    ["AI и питание", "Почему камера не может увидеть масло в соусе", "7 минут", "article-three"],
    ["Поведение", "Что делать после дня, который вышел за план", "5 минут", "article-four"],
    ["Методология", "Как JIVELO будет адаптировать дневную норму", "10 минут", "article-five"],
    ["Для специалистов", "Недельный обзор вместо ручной таблицы", "8 минут", "article-six"],
  ];
  return <>
    <section className="editorial-hero"><div className="shell"><PageEyebrow icon="book">Журнал JIVELO</PageEyebrow><h1>О питании —<br/><em>без давления и сенсаций.</em></h1><p>Методология, привычки, AI и практические решения для нормальной жизни.</p><article className="featured-article"><div/><section><span>ГЛАВНЫЙ МАТЕРИАЛ · 12 МИНУТ</span><h2>Почему «идеальный день» мешает видеть настоящий прогресс</h2><p>Разбираем, как недельный контекст снижает тревогу и помогает принимать устойчивые решения.</p><button>Читать материал <SiteIcon name="arrow" size={16}/></button></section></article></div></section>
    <section className="shell page-section"><div className="article-catalog">{articles.map(([category,title,time,cls])=><article key={title}><div className={cls}/><span>{category} · {time}</span><h3>{title}</h3><p>Понятное объяснение с практическими выводами и источниками.</p><button>Читать <SiteIcon name="arrow" size={15}/></button></article>)}</div></section>
    <PageCta eyebrow="Знания без перегрузки" title={<>Понимайте питание,<br/><em>не превращая жизнь в исследование.</em></>} text="Подпишитесь на ранний доступ и новые материалы JIVELO."/>
  </>;
}

function Security() {
  return <>
    <PageHero eyebrow="Безопасность и приватность" icon="shield" title="Данные о питании" accent="остаются вашими данными." text="JIVELO проектируется с приватностью по умолчанию: закрытое хранение, управляемые разрешения, экспорт и удаление без обращения в поддержку." primary="Создать аккаунт" secondary="Политика конфиденциальности" secondaryHref="/privacy" visual={<div className="security-hero"><div className="security-lock"><SiteIcon name="shield" size={50}/><i/><i/><i/></div><article><small>ВАШИ РАЗРЕШЕНИЯ</small><div><span>AI-анализ фотографий</span><b>Разрешено</b></div><div><span>Доступ специалиста</span><b>Только А. Воронова</b></div><div><span>Хранение оригиналов</span><b>30 дней</b></div><button>Управлять доступом</button></article></div>}/>
    <section className="shell page-section"><PageIntro eyebrow="Приватность по умолчанию" icon="shield" title={<>Контроль понятен<br/><em>без юридического образования.</em></>} text="Критические настройки доступны в профиле, а не спрятаны в длинной политике."/><div className="security-grid"><article><SiteIcon name="shield"/><h3>Закрытое хранение</h3><p>Фотографии и дневник не публикуются и не доступны другим пользователям.</p></article><article><SiteIcon name="users"/><h3>Точечный доступ</h3><p>Специалист видит данные только после приглашения, которое можно отозвать.</p></article><article><SiteIcon name="camera"/><h3>Удаление оригинала</h3><p>Фото можно удалить, сохранив рассчитанные продукты и значения.</p></article><article><SiteIcon name="book"/><h3>Журнал действий</h3><p>Чувствительные действия и административный доступ фиксируются.</p></article><article><SiteIcon name="arrow"/><h3>Экспорт данных</h3><p>Пользователь сможет выгрузить дневник, измерения и настройки.</p></article><article><SiteIcon name="check"/><h3>Полное удаление</h3><p>Закрытие аккаунта запускает понятный процесс удаления данных.</p></article></div></section>
    <section className="security-detail page-section"><div className="shell"><PageIntro eyebrow="Инженерные меры" icon="shield" title={<>Не только обещания<br/><em>на маркетинговой странице.</em></>} text="Перед запуском будут опубликованы модель угроз, сроки хранения, список обработчиков и контакты для сообщений об уязвимостях."/><div className="security-list"><article><span>01</span><b>TLS и защищённые сессии</b><p>Шифрование при передаче, безопасные cookies и отзыв активных сессий.</p></article><article><span>02</span><b>Приватное файловое хранилище</b><p>Закрытые bucket, временные подписанные ссылки и проверка загрузок.</p></article><article><span>03</span><b>Минимальные права</b><p>Роли сотрудников и сервисов получают только необходимый уровень доступа.</p></article><article><span>04</span><b>Резервное копирование</b><p>Регулярные копии, тест восстановления и документированный план инцидентов.</p></article></div></div></section>
    <PageCta eyebrow="Контроль в ваших руках" title={<>Продукт должен быть красивым.<br/><em>И столь же серьёзным внутри.</em></>} text="Вопросы безопасности можно будет отправлять на security@jivoetelo.ru."/>
  </>;
}

function LegalPage({ type }: { type: "privacy" | "terms" }) {
  const privacy = type === "privacy";
  return <section className="legal-page shell"><PageEyebrow icon="shield">{privacy ? "Политика конфиденциальности" : "Условия использования"}</PageEyebrow><h1>{privacy ? <>Контроль над данными<br/><em>без мелкого шрифта.</em></> : <>Понятные правила<br/><em>до начала использования.</em></>}</h1><p className="legal-lead">Черновая структура документа для продуктового прототипа. Финальная юридическая редакция будет опубликована до сбора реальных пользовательских данных и оплаты.</p><div className="legal-layout"><aside><a href="#one">01 · Общие положения</a><a href="#two">02 · Какие данные</a><a href="#three">03 · Использование</a><a href="#four">04 · Права пользователя</a><a href="#five">05 · Контакты</a></aside><article><section id="one"><span>01</span><h2>Общие положения</h2><p>JIVELO — цифровой сервис для ведения дневника питания, планирования и информационных рекомендаций. Он не является медицинской системой и не заменяет консультацию врача.</p></section><section id="two"><span>02</span><h2>{privacy ? "Какие данные обрабатываются" : "Аккаунт и допустимое использование"}</h2><p>{privacy ? "Для работы могут потребоваться данные профиля, записи о питании, фотографии блюд, измерения и настройки согласий. Конкретный состав и сроки хранения будут перечислены в финальной версии." : "Пользователь отвечает за точность введённых данных, безопасность своего аккаунта и законность загружаемых материалов. Запрещены попытки нарушить работу сервиса или получить доступ к чужим данным."}</p></section><section id="three"><span>03</span><h2>{privacy ? "Как используются данные" : "Подписка и функции"}</h2><p>{privacy ? "Данные используются для отображения дневника, расчётов, персонализации, AI-анализа при наличии согласия, поддержки и безопасности. Они не должны продаваться рекламодателям." : "Состав тарифов и условия оплаты показываются до оформления. Пользователь сможет отменить продление в настройках, а ключевые изменения условий будут сообщаться заранее."}</p></section><section id="four"><span>04</span><h2>Права пользователя</h2><p>Пользователь сможет исправить данные, выгрузить историю, отозвать разрешения, удалить фотографии, отключить специалиста и закрыть аккаунт.</p></section><section id="five"><span>05</span><h2>Контакты</h2><p>Вопросы о продукте: hello@jivoetelo.ru. Вопросы безопасности: security@jivoetelo.ru. Контакты оператора данных будут добавлены до публичного запуска.</p></section></article></div></section>;
}

function Contact() {
  return <section className="contact-page shell"><div className="contact-copy"><PageEyebrow icon="spark">Связаться с JIVELO</PageEyebrow><h1>Расскажите,<br/><em>что вы хотите создать вместе с нами.</em></h1><p>Ранний доступ для пользователей, пилот для специалиста, клиника или партнёрская интеграция.</p><div className="contact-methods"><article><small>ОБЩИЕ ВОПРОСЫ</small><b>hello@jivoetelo.ru</b></article><article><small>БЕЗОПАСНОСТЬ</small><b>security@jivoetelo.ru</b></article><article><small>ДОМЕН</small><b>jivoetelo.ru</b></article></div></div><form className="contact-form"><label><span>Как к вам обращаться</span><input placeholder="Имя"/></label><label><span>Email</span><input type="email" placeholder="name@example.com"/></label><label><span>Что вас интересует</span><select defaultValue="early"><option value="early">Ранний доступ</option><option value="pro">JIVELO Pro</option><option value="clinic">Клиника или команда</option><option value="partner">Партнёрство</option></select></label><label><span>Сообщение</span><textarea rows={6} placeholder="Расскажите о задаче"/></label><button type="button" className="button large">Отправить сообщение <SiteIcon name="arrow"/></button><small>Форма является визуальным прототипом и будет подключена к backend на следующем этапе.</small></form></section>;
}

function Auth({ register }: { register: boolean }) {
  return <section className="auth-page"><div className="auth-visual"><Link href="/"><Brand/></Link><div><PageEyebrow icon="spark" light>{register ? "Начало вашего ритма" : "С возвращением"}</PageEyebrow><h1>{register ? <>Первый приём пищи —<br/><em>уже начало.</em></> : <>Продолжим<br/><em>с того же места.</em></>}</h1><p>{register ? "Создайте профиль раннего доступа. Никакой карты и навязчивой рекламы." : "Ваш дневник, план и прогресс будут ждать в одном спокойном интерфейсе."}</p></div><blockquote>«Не ещё одна диета. Интерфейс, который помогает принять следующее нормальное решение».</blockquote></div><div className="auth-form-wrap"><form className="auth-form"><small>{register ? "РАННИЙ ДОСТУП" : "ЛИЧНЫЙ КАБИНЕТ"}</small><h2>{register ? "Создать аккаунт" : "Войти в JIVELO"}</h2>{register && <label><span>Имя</span><input placeholder="Как к вам обращаться"/></label>}<label><span>Email</span><input type="email" placeholder="name@example.com"/></label><label><span>Пароль</span><input type="password" placeholder="Не менее 8 символов"/></label>{register && <label className="auth-check"><input type="checkbox"/><span>Я согласен с <Link href="/privacy">политикой конфиденциальности</Link> и <Link href="/terms">условиями</Link>.</span></label>}<button type="button" className="button large">{register ? "Создать аккаунт" : "Войти"}<SiteIcon name="arrow"/></button><div className="auth-divider"><i/>или<i/></div><button type="button" className="auth-chatgpt">Продолжить с ChatGPT</button><p>{register ? <>Уже есть аккаунт? <Link href="/login">Войти</Link></> : <>Ещё нет аккаунта? <Link href="/register">Создать</Link></>}</p><small className="prototype-note">Форма пока демонстрационная и будет подключена к авторизации на следующем этапе.</small></form></div></section>;
}

export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!supported.includes(slug)) notFound();
  if (slug === "recipes") return <main className="inner-page recipes-page"><Recipes/></main>;
  if (slug === "articles") return <main className="inner-page articles-page"><Articles/></main>;
  if (slug === "security") return <main className="inner-page security-page"><Security/></main>;
  if (slug === "privacy" || slug === "terms") return <main className="inner-page"><LegalPage type={slug}/></main>;
  if (slug === "contact") return <main className="inner-page"><Contact/></main>;
  if (slug === "login" || slug === "register") return <main className="inner-page auth-root"><Auth register={slug === "register"}/></main>;
  notFound();
}

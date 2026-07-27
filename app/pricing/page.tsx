import type { Metadata } from "next";
import Link from "next/link";
import { PageCta, PageHero, PageIntro } from "../components/marketing-sections";
import { SiteIcon } from "../components/site-chrome";

export const metadata: Metadata = {
  title: "Тарифы",
  description: "Бесплатный дневник JIVELO, Premium с AI-навигацией и JIVELO Pro для специалистов.",
};

const rows = [
  ["Дневник питания", true, true, true],
  ["Калории и БЖУ", true, true, true],
  ["Плавный тренд веса", true, true, true],
  ["AI-распознавание по фото", "5 снимков / мес.", "Без ограничений", "Без ограничений"],
  ["Голосовой и текстовый ввод", false, true, true],
  ["Что съесть сейчас?", false, true, true],
  ["Адаптивный план", false, true, true],
  ["Микронутриенты и аналитика", false, true, true],
  ["Связь со специалистом", false, "По приглашению", true],
  ["Клиенты и группы", false, false, true],
  ["Недельные отчёты", false, "Личный обзор", "Профессиональные"],
];

function Value({ value }: { value: boolean | string }) {
  if (value === true) return <span className="yes"><SiteIcon name="check" size={15}/></span>;
  if (value === false) return <span className="no">—</span>;
  return <span>{value}</span>;
}

export default function PricingPage() {
  return <main className="inner-page pricing-page">
    <PageHero
      eyebrow="Простые тарифы"
      icon="spark"
      title="Начните бесплатно."
      accent="Подключайте интеллект, когда он нужен."
      text="Базовый дневник остаётся доступным без рекламы. Premium добавляет AI-навигацию, а Pro создаёт полноценное рабочее пространство для специалиста."
      primary="Начать бесплатно"
      secondary="Сравнить возможности"
      secondaryHref="#compare"
      visual={<div className="pricing-hero-stack">
        <article className="price-mini free"><span>FREE</span><strong>0 ₽</strong><p>Дневник и базовая динамика</p></article>
        <article className="price-mini premium"><i>РЕКОМЕНДУЕМ</i><span>PREMIUM</span><strong>399 ₽<small>/ мес.</small></strong><p>Полный AI-навигатор питания</p><div><SiteIcon name="spark"/><b>Фото · голос · адаптивный план</b></div></article>
        <article className="price-mini pro"><span>PRO</span><strong>от 1 990 ₽<small>/ мес.</small></strong><p>Клиенты и профессиональные отчёты</p></article>
      </div>}
    />

    <section className="shell page-section plans-full">
      <article><header><span>FREE</span><h2>Для знакомства</h2><p>Спокойный дневник питания без рекламы и наказаний.</p><strong>0 ₽<small>навсегда</small></strong></header><ul><li><SiteIcon name="check" size={15}/>Ручной дневник</li><li><SiteIcon name="check" size={15}/>Калории и БЖУ</li><li><SiteIcon name="check" size={15}/>Тренд веса</li><li><SiteIcon name="check" size={15}/>5 AI-снимков в месяц</li></ul><Link href="/register" className="button outline">Начать бесплатно</Link></article>
      <article className="featured"><i>ЛУЧШИЙ ВЫБОР</i><header><span>PREMIUM</span><h2>Для ежедневного ритма</h2><p>Все инструменты JIVELO для персональной навигации.</p><strong>399 ₽<small>в месяц при оплате за год</small></strong><em>или 599 ₽ помесячно</em></header><ul><li><SiteIcon name="check" size={15}/>Безлимитное фото и голос</li><li><SiteIcon name="check" size={15}/>Что съесть сейчас?</li><li><SiteIcon name="check" size={15}/>Адаптивные цели</li><li><SiteIcon name="check" size={15}/>Расширенная аналитика</li><li><SiteIcon name="check" size={15}/>Планирование и список покупок</li></ul><Link href="/register" className="button light">Попробовать Premium <SiteIcon name="arrow" size={16}/></Link></article>
      <article><header><span>JIVELO PRO</span><h2>Для специалиста</h2><p>Клиенты, дневники, цели, сообщения и отчёты.</p><strong>от 1 990 ₽<small>в месяц</small></strong><em>до 10 активных клиентов</em></header><ul><li><SiteIcon name="check" size={15}/>Всё из Premium</li><li><SiteIcon name="check" size={15}/>Кабинет специалиста</li><li><SiteIcon name="check" size={15}/>Общие цели и комментарии</li><li><SiteIcon name="check" size={15}/>Недельные отчёты</li><li><SiteIcon name="check" size={15}/>Безопасные сообщения</li></ul><Link href="/pro" className="button outline">Подробнее о Pro</Link></article>
    </section>

    <section className="pricing-note shell"><span><SiteIcon name="leaf"/></span><p><b>Никаких рекламных баннеров во Free.</b> Бесплатный тариф должен оставаться полезным продуктом, а не демонстрацией, которой невозможно пользоваться.</p></section>

    <section className="shell page-section" id="compare">
      <PageIntro eyebrow="Полное сравнение" icon="check" title={<>Выберите уровень,<br/><em>который нужен сейчас.</em></>} text="Функции можно подключить позже. Данные дневника и история прогресса сохраняются при переходе между тарифами."/>
      <div className="compare-table"><div className="compare-head"><span>Возможность</span><b>Free</b><b>Premium</b><b>Pro</b></div>{rows.map(([label, free, premium, pro]) => <div className="compare-row" key={String(label)}><strong>{label}</strong><Value value={free as boolean|string}/><Value value={premium as boolean|string}/><Value value={pro as boolean|string}/></div>)}</div>
    </section>

    <section className="annual-section page-section"><div className="shell annual-grid">
      <div><PageIntro eyebrow="Годовой Premium" icon="spark" title={<>Двенадцать месяцев<br/><em>по цене спокойного решения.</em></>} text="Годовой план стоит дешевле помесячного и включает все будущие Premium-функции текущего продуктового цикла." align="center"/></div>
      <div className="annual-card"><span>PREMIUM · 12 МЕСЯЦЕВ</span><strong>4 788 ₽</strong><p>399 ₽ в месяц · экономия 2 400 ₽</p><div><b>30 дней на спокойное знакомство</b><small>Отмена подписки доступна в настройках. Без звонков и скрытых условий.</small></div><Link href="/register" className="button light large">Начать бесплатно <SiteIcon name="arrow"/></Link></div>
    </div></section>

    <section className="shell page-section pricing-faq">
      <PageIntro eyebrow="Оплата и подписка" icon="shield" title={<>Понятные условия.<br/><em>Без неприятных сюрпризов.</em></>} text="Короткие ответы на вопросы о бесплатном тарифе, пробном периоде, отмене и доступе специалиста."/>
      <div className="pricing-faq-grid"><article><h3>Free действительно бесплатный?</h3><p>Да. Базовый дневник, КБЖУ и тренд веса доступны без ограничения по времени и без рекламных баннеров.</p></article><article><h3>Что произойдёт после отмены Premium?</h3><p>Аккаунт перейдёт на Free. Дневник и история сохранятся, но Premium-функции станут недоступны.</p></article><article><h3>Специалист оплачивает доступ клиента?</h3><p>В JIVELO Pro активные клиенты входят в лимит тарифа. Условия для организаций будут рассчитываться отдельно.</p></article><article><h3>Можно вернуть оплату?</h3><p>Правила возврата будут опубликованы до запуска оплаты и сформулированы простым языком в личном кабинете.</p></article></div>
    </section>

    <PageCta eyebrow="Начните с бесплатного дневника" title={<>Попробуйте JIVELO.<br/><em>Решение о Premium примете позже.</em></>} text="Никакой карты на первом шаге. Сначала создайте профиль и добавьте первый приём пищи."/>
  </main>;
}

"use client";

import { useActionState, useState } from "react";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { Logo } from "./logo";
import { joinWaitlist, type WaitlistState } from "./waitlist-action";

const initialWaitlistState: WaitlistState = { status: "idle" };

const navItems = ["Продукт", "Решения", "Журнал", "О нас"];
const meals = [
  ["08:15", "Завтрак", "Яйца, гречка, зелень", "468"],
  ["13:20", "Обед", "Рыба, овощи, булгур", "612"],
  ["19:00", "Ужин", "Время выбрать, что поддержит вас", ""],
];

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState(false);
  const [period, setPeriod] = useState("Сегодня");
  const [waitlist, waitlistAction, waitlistPending] = useActionState(joinWaitlist, initialWaitlistState);

  return <main>
    <header className="site-header">
      <a className="logo" href="#top"><span><Logo /></span>Живое Тело</a>
      <nav className="main-nav" aria-label="Навигация">
        {navItems.map((item, index) => <button key={item} onClick={() => index < 2 ? setMenu(!menu) : document.getElementById(index === 2 ? "journal" : "about")?.scrollIntoView({ behavior: "smooth" })}>{item}{index < 2 && <small>⌄</small>}</button>)}
      </nav>
      <div className="header-actions"><a className="login" href="/login">Войти</a><a className="header-cta" href="/register">Начать <b>↗</b></a></div>
      {menu && <div className="mega-menu"><div><p>Продукт</p><a href="#experience">Дневник питания <b>→</b></a><a href="#experience">Персональный план <b>→</b></a><a href="#experience">Прогресс и привычки <b>→</b></a></div><div><p>Решения</p><a href="#specialists">Для себя <b>→</b></a><a href="#specialists">Для специалистов <b>→</b></a><a href="#specialists">Для команд <b>→</b></a></div><aside>Не «идеальный» рацион.<br /><em>Ваш устойчивый ритм.</em></aside></div>}
    </header>

    <section className="intro" id="top"><div className="intro-grid"><div className="intro-copy"><p className="kicker">Новая культура заботы о себе <i /></p><h1>Питание —<br />не задача.<br /><em>Отношения.</em></h1><p className="intro-lead">Живое Тело помогает видеть питание в контексте вашей настоящей жизни — без строгих правил, тревоги и бесконечного подсчёта.</p><div className="intro-actions"><button className="black-button" onClick={() => setNotice(true)}>Создать свой план <b>↗</b></button><a href="#experience">Смотреть продукт <span>↓</span></a></div><div className="intro-meta"><span>01 / 04</span><i /><span>Питание в ритме вашего тела</span></div></div><div className="intro-statement"><p>Хорошее питание<br />начинается не с контроля.</p><b>С внимательного<br />вопроса к себе.</b><span>Живое Тело<br />2026</span></div></div></section>

    <section className="experience" id="experience"><div className="section-top"><p className="kicker">Личный кабинет <i /></p><div><h2>Знать, что важно<br /><em>именно сегодня.</em></h2><p>Вместо сводки калорий — ясный следующий шаг. Вместо штрафов — понимание динамики.</p></div></div>
      <div className="product-frame"><aside className="app-side"><a className="app-logo" href="#top">Ж</a><div className="app-nav"><button className="selected">⌂<span>Сегодня</span></button><button>◒<span>Дневник</span></button><button>⌁<span>План</span></button><button>⌇<span>Динамика</span></button></div><button className="profile-dot">МС</button></aside><div className="app-main"><div className="app-top"><div><p>СРЕДА, 18 ИЮНЯ</p><h3>Добрый день, Марина.</h3></div><div className="periods">{["Сегодня", "Неделя", "Месяц"].map(x => <button className={period === x ? "active" : ""} onClick={() => setPeriod(x)} key={x}>{x}</button>)}</div><button className="round-plus" onClick={() => setNotice(true)}>+</button></div><div className="score-row"><div className="day-score"><p>Ваш ритм сегодня</p><strong>Хороший</strong><span>Вы бережно держите свой темп</span></div><div className="progress-circle"><b>74</b><small>%</small></div><div className="energy"><p>Энергия на сегодня</p><strong>1 480 <small>ккал</small></strong><span>из 2 000 ккал</span><div><i style={{width:"74%"}} /></div></div></div><div className="app-columns"><div className="meal-column"><div className="subhead"><h4>Ваш день</h4><button>Открыть дневник →</button></div>{meals.map((m,i)=><article className="meal-row" key={m[1]}><time>{m[0]}</time><i className={`meal-marker m${i}`} /><div><b>{m[1]}</b><span>{m[2]}</span></div>{m[3] ? <strong>{m[3]}<small> ккал</small></strong> : <button onClick={() => setNotice(true)}>Подобрать →</button>}</article>)}</div><div className="insight"><span>Ж</span><p>Сегодня вам подойдёт ужин с овощами и источником белка.</p><button onClick={() => setNotice(true)}>Собрать идею <b>↗</b></button></div></div></div></div>
    </section>

    <section className="principles"><div className="principles-title"><p className="kicker">В основе <i /></p><h2>Система, которая<br />не мешает <em>жить.</em></h2></div><div className="principles-list"><article><span>01</span><div><h3>Еда за несколько секунд</h3><p>Фото, голос или текст — выберите самый естественный для вас способ записать приём пищи.</p></div><b>↗</b></article><article><span>02</span><div><h3>Честная оценка, а не иллюзия точности</h3><p>Сервис показывает, насколько уверен в расчёте, и уточняет только то, что влияет на результат.</p></div><b>↗</b></article><article><span>03</span><div><h3>План, который адаптируется</h3><p>Сон, активность и реальная динамика меняют рекомендации — не вы подстраиваетесь под таблицу.</p></div><b>↗</b></article></div></section>

    <section className="specialists" id="specialists"><div><p className="kicker">Живое Тело Pro <i /></p><h2>Профессиональная<br />забота <em>о каждом.</em></h2><p>Специалист видит не просто отчёт, а контекст: регулярность, самочувствие, точки, где нужна поддержка.</p><button className="white-button" onClick={() => setNotice(true)}>Узнать о Pro <b>↗</b></button></div><div className="pro-screen"><div className="pro-head"><span>КЛИЕНТЫ</span><button>+ Пригласить клиента</button></div><div className="pro-client"><i /><div><b>Алина Никитина</b><span>План: мягкое снижение веса</span></div><em>Стабильный ритм</em></div><div className="pro-client"><i /><div><b>Ирина Мартынова</b><span>План: регулярное питание</span></div><em>Нужна поддержка</em></div><div className="pro-client"><i /><div><b>Виктория С.</b><span>План: работа с белком</span></div><em>Стабильный ритм</em></div></div></section>

    <section className="journal" id="journal"><div className="section-top"><p className="kicker">Журнал <i /></p><div><h2>О теле —<br /><em>с уважением.</em></h2><p>Понятные материалы о еде, энергии и привычках, написанные без давления.</p></div></div><div className="articles"><article><span>ЗНАНИЯ · 6 МИН</span><h3>Почему регулярность важнее «идеального» рациона</h3><a href="#journal">Читать статью →</a></article><article><span>ПРАКТИКА · 4 МИН</span><h3>Как вернуть себе чувство голода и насыщения</h3><a href="#journal">Читать статью →</a></article><article><span>ВЗГЛЯД · 8 МИН</span><h3>Тело не обязано быть проектом по улучшению</h3><a href="#journal">Читать статью →</a></article></div></section>

    <footer id="about"><div className="footer-top"><a className="logo" href="#top"><span><Logo /></span>Живое Тело</a><h2>Начните слышать<br /><em>себя.</em></h2><button className="coral-button" onClick={() => setNotice(true)}>Создать свой план <b>↗</b></button></div><p className="footer-disclaimer">{NOT_MEDICAL_DISCLAIMER} <a href="/legal/health">Подробнее о границах сервиса →</a></p><div className="footer-bottom"><span>© Живое Тело, 2026</span><a href="/raschet">Расчёты</a><a href="/legal/terms">Соглашение</a><a href="/legal/privacy">Конфиденциальность</a><a href="/legal/health">Границы сервиса</a><a href="/legal">Все документы</a></div></footer>
    {notice && <div className="notice" role="dialog" aria-modal="true"><div><button aria-label="Закрыть" onClick={()=>setNotice(false)}>×</button><span>Ж</span>
      {waitlist.status === "success"
        ? <><h2>Вы в списке.<br /><em>Спасибо.</em></h2><p>Мы напишем, как только откроем ранний доступ к Живому Телу.</p><button className="black-button" onClick={()=>setNotice(false)}>Готово <b>↗</b></button></>
        : <><h2>Скоро будет<br /><em>по-настоящему.</em></h2><p>Оставьте e-mail — пригласим в закрытый запуск Живого Тела.</p>
          <form action={waitlistAction}>
            {/* defaultValue из состояния: React сбрасывает форму после
                server action, и без этого адрес пришлось бы вводить заново. */}
            <input name="email" placeholder="Ваш e-mail" type="email" defaultValue={waitlist.email ?? ""} required autoFocus/>
            <label className="consent"><input name="consent" type="checkbox" defaultChecked={waitlist.consent ?? false} required /><span>Согласен на обработку адреса для приглашения в сервис — <a href="/legal/consent" target="_blank">согласие</a> и <a href="/legal/privacy" target="_blank">политика</a>.</span></label>
            {waitlist.status === "invalid" && <small className="form-error">Похоже, в адресе опечатка — проверьте и попробуйте ещё раз.</small>}
            {waitlist.status === "no_consent" && <small className="form-error">Без согласия мы не сохраняем адрес — отметьте галочку.</small>}
            {waitlist.status === "error" && <small className="form-error">Не получилось сохранить. Попробуйте ещё раз через минуту.</small>}
            <button className="black-button" type="submit" disabled={waitlistPending}>{waitlistPending ? "Отправляем…" : <>Встать в лист ожидания <b>↗</b></>}</button>
          </form></>}
    </div></div>}
  </main>;
}

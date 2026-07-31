"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AppInvite } from "./app-invite";
import { Logo } from "./logo";
import { SiteFooter } from "./site-footer";

/**
 * Здесь была форма листа ожидания: «Скоро будет по-настоящему — пригласим в
 * закрытый запуск». Она осталась с того времени, когда продукта ещё не было,
 * и к моменту, когда заработали регистрация, бот и Mini App, стала прямой
 * неправдой — тем более что в шапке той же страницы жила рабочая ссылка на
 * регистрацию. Кнопки ведут в продукт.
 *
 * Таблица waitlist_subscribers и её описание в документах остаются: люди,
 * оставившие адрес, никуда не делись, и выгрузка данных обязана их показывать.
 */

const navItems = ["Продукт", "Решения", "Журнал", "О нас"];

export default function Home() {
  const [menu, setMenu] = useState(false);

  return <main>
    {/* Меню закрывается, когда курсор уходит со всей шапки: сама выпадающая
        панель лежит внутри неё, поэтому переход с пункта на панель разрывом
        не считается. Escape — для тех, кто пришёл с клавиатуры. */}
    <header
      className="site-header"
      onMouseLeave={() => setMenu(false)}
      onKeyDown={(event) => { if (event.key === "Escape") setMenu(false); }}
    >
      <a className="logo" href="#top"><span><Logo /></span>Живое Тело</a>
      <nav className="main-nav" aria-label="Навигация">
        {navItems.map((item, index) => index < 2
          ? <button
              key={item}
              aria-expanded={menu}
              // Наведение — основной способ, но не единственный: на телефоне
              // его нет вовсе, а с клавиатуры до меню добираются табом.
              onMouseEnter={() => setMenu(true)}
              onFocus={() => setMenu(true)}
              onClick={() => setMenu(!menu)}
            >{item}<small>⌄</small></button>
          : <button
              key={item}
              onMouseEnter={() => setMenu(false)}
              onClick={() => document.getElementById(index === 2 ? "journal" : "about")?.scrollIntoView({ behavior: "smooth" })}
            >{item}</button>)}
      </nav>
      <div className="header-actions"><a className="login" href="/login">Войти</a><a className="header-cta" href="/register">Начать <b>↗</b></a></div>
      {menu && <div className="mega-menu"><div><p>Продукт</p><a href="#experience">Дневник питания <b>→</b></a><a href="#experience">Персональный план <b>→</b></a><a href="#experience">Прогресс и привычки <b>→</b></a></div><div><p>Решения</p><a href="#specialists">Для себя <b>→</b></a><Link href="/pro">Для специалистов <b>→</b></Link><a href="#specialists">Для команд <b>→</b></a></div><aside>Считает по фотографии.<br /><em>Работает в Telegram.</em></aside></div>}
    </header>

    <section className="intro" id="top"><div className="intro-grid"><div className="intro-copy"><p className="kicker">Дневник питания по фотографиям <i /></p><h1>Сфотографируйте<br />еду.<br /><em>Остальное посчитаем.</em></h1><p className="intro-lead">Сфотографируйте тарелку — увидите состав. Через неделю записей сервис поймёт вашу норму точнее любой формулы: по тому, как отзывается ваше тело, а не по среднему человеку вашего роста.</p><div className="intro-actions"><Link className="black-button" href="/raschet/plan">Создать свой план <b>↗</b></Link><a href="#experience">Смотреть продукт <span>↓</span></a></div><div className="intro-meta"><span>01 / 04</span><i /><span>Питание в ритме вашего тела</span></div></div><div className="intro-statement"><p>Сначала — увидеть,<br />что происходит.</p><b>Решения<br />потом.</b><span>Живое Тело<br />2026</span></div></div></section>

    <section className="experience" id="experience"><div className="section-top"><p className="kicker">Личный кабинет <i /></p><div><h2>Как выглядит<br /><em>ваш день.</em></h2><p>Пять чисел за день, четыре записи и одна подсказка. Ничего, что нужно настраивать, и ничего, что горит красным.</p></div></div>
      {/* Снимок настоящего кабинета, а не нарисованный макет. Прежний макет
          обещал разделы «Дневник / План / Динамика» и оценку «ваш ритм
          сегодня» — ничего этого в продукте нет и не планировалось.
          Пересобрать: node scripts/site-shots.mjs */}
      <figure className="product-frame">
        <Image
          src="/site/cabinet.webp"
          alt="Экран «Сегодня» в личном кабинете: итоги дня, приёмы пищи с составом и подсказка «что съесть дальше»"
          width={1920}
          height={1200}
          sizes="(max-width: 850px) 100vw, 1280px"
        />
      </figure>
    </section>

    <section className="principles"><div className="principles-title"><p className="kicker">В основе <i /></p><h2>На чём это<br /><em>построено.</em></h2></div><div className="principles-list"><article><span>01</span><div><h3>Записать проще, чем не записать</h3><p>Фотография в Telegram, строка текста, позиция из справочника — что быстрее в эту минуту, то и подойдёт. Разбирать можно потом.</p></div><b>↗</b></article><article><span>02</span><div><h3>Где мы не уверены — там так и написано</h3><p>У каждой позиции стоит уверенность оценки. Уточнить сервис просит только то, что заметно меняет результат.</p></div><b>↗</b></article><article><span>03</span><div><h3>Норма пересчитывается по вашим данным</h3><p>Не по тому, что должно происходить с человеком вашего веса, а по тому, что происходит с вами: сколько вы едите на самом деле и как меняется вес.</p></div><b>↗</b></article></div></section>

    {/* После принципов и до Pro: человек уже понял, что за сервис, и здесь
        уместно показать, где им пользуются на самом деле — в телефоне. */}
    <AppInvite
      wide
      start="site"
      qr="/qr/bot-site.svg"
      title="И всё это — в телефоне"
      lead={
        "Дневник ведут там, где едят: сфотографировали тарелку, и состав посчитан. " +
        "В Telegram ни почты, ни пароля не нужно — нажали «Начать», и дневник ваш."
      }
    />

    <section className="specialists" id="specialists"><div><p className="kicker">Живое Тело Pro <i /></p><h2>Для нутрициологов<br /><em>и тренеров.</em></h2><p>Клиент сам выбирает, что открыть: итоги недели, дневник, вес — или ничего. Специалист видит ровно это и ничего сверх, а закрыть доступ можно в любой момент.</p><Link className="white-button" href="/pro">Узнать о Pro <b>↗</b></Link></div>
      {/* Тоже снимок. В прежнем макете у клиентов стояли бейджи «Стабильный
          ритм» и «Нужна поддержка» — оценки человека, которых продукт не
          выдаёт принципиально. На настоящем экране вместо них видно то, что
          есть: какие разделы клиент открыл сам. */}
      <figure className="pro-screen">
        <Image
          src="/site/pro.webp"
          alt="Список клиентов в кабинете специалиста: у каждого видно, какие разделы он открыл — итоги недели, дневник, вес"
          width={1320}
          height={647}
          sizes="(max-width: 850px) 100vw, 600px"
        />
      </figure>
    </section>

    <section className="journal" id="journal"><div className="section-top"><p className="kicker">Журнал <i /></p><div><h2>О теле —<br /><em>с уважением.</em></h2><p>Понятные материалы о еде, энергии и привычках, написанные без давления.</p></div></div><div className="articles"><article><span>ЗНАНИЯ · 6 МИН</span><h3>Почему регулярность важнее «идеального» рациона</h3><a href="#journal">Читать статью →</a></article><article><span>ПРАКТИКА · 4 МИН</span><h3>Как вернуть себе чувство голода и насыщения</h3><a href="#journal">Читать статью →</a></article><article><span>ВЗГЛЯД · 8 МИН</span><h3>Тело не обязано быть проектом по улучшению</h3><a href="#journal">Читать статью →</a></article></div></section>

    {/* Крупный призыв — только здесь: в конце соглашения он был бы неуместен,
        поэтому живёт снаружи подвала, а не внутри него. */}
    <SiteFooter>
      <div className="footer-top">
        <a className="logo" href="#top"><span><Logo /></span>Живое Тело</a>
        <h2>Начните с одной<br /><em>фотографии.</em></h2>
        <Link className="coral-button" href="/raschet/plan">Создать свой план <b>↗</b></Link>
      </div>
    </SiteFooter>
  </main>;
}

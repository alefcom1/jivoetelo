"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./logo";

/**
 * Шапка сайта — одна на все публичные страницы.
 *
 * ## Зачем понадобилось
 *
 * Раньше она существовала ровно в одном месте — внутри разметки главной. На
 * `/pro`, `/raschet`, `/skolko-kalorij` и в документах стояли свои огрызки:
 * логотип и одна кнопка. Меню не было нигде, кроме главной, и человек,
 * пришедший из поиска на калькулятор, не мог попасть ни в «Продукт», ни в
 * «Журнал» — только на главную по логотипу, и то догадавшись.
 *
 * ## Почему клиентский компонент
 *
 * Из-за выпадающего меню: ему нужно состояние. Зато теперь оно нужно только
 * здесь — до этого из-за него вся главная целиком была клиентской.
 *
 * ## Про ссылки на разделы
 *
 * Разделы «Продукт», «Журнал» и «О нас» живут якорями на главной. На самой
 * главной по ним плавно прокручиваем, с других страниц — переходим. Одно и
 * то же поведение везде выглядело бы поломкой: на главной перезагрузка ради
 * прокрутки, на других страницах прокрутка в никуда.
 */

const SECTIONS = [
  { label: "Продукт", menu: true },
  { label: "Решения", menu: true },
  { label: "Журнал", anchor: "journal" },
  { label: "О нас", anchor: "about" },
] as const;

export type HeaderCta = { href: string; label: string };

const DEFAULT_CTA: HeaderCta = { href: "/register", label: "Начать" };

/** Прокрутка, если раздел на этой же странице; иначе — обычный переход. */
function goToSection(anchor: string) {
  const target = document.getElementById(anchor);
  if (target) target.scrollIntoView({ behavior: "smooth" });
  else window.location.assign(`/#${anchor}`);
}

export function SiteHeader({ cta = DEFAULT_CTA }: { cta?: HeaderCta }) {
  const [menu, setMenu] = useState(false);

  return <header
    className="site-header"
    // Меню закрывается, когда курсор уходит со всей шапки: сама выпадающая
    // панель лежит внутри неё, поэтому переход с пункта на панель разрывом
    // не считается. Escape — для тех, кто пришёл с клавиатуры.
    onMouseLeave={() => setMenu(false)}
    onKeyDown={(event) => { if (event.key === "Escape") setMenu(false); }}
  >
    <Link className="logo" href="/"><span><Logo /></span>Живое Тело</Link>
    <nav className="main-nav" aria-label="Навигация">
      {SECTIONS.map((section) => "menu" in section
        ? <button
            key={section.label}
            aria-expanded={menu}
            // Наведение — основной способ, но не единственный: на телефоне
            // его нет вовсе, а с клавиатуры до меню добираются табом.
            onMouseEnter={() => setMenu(true)}
            onFocus={() => setMenu(true)}
            onClick={() => setMenu(!menu)}
          >{section.label}<small>⌄</small></button>
        : <button
            key={section.label}
            onMouseEnter={() => setMenu(false)}
            onClick={() => goToSection(section.anchor)}
          >{section.label}</button>)}
    </nav>
    <div className="header-actions">
      <Link className="login" href="/login">Войти</Link>
      <Link className="header-cta" href={cta.href}>{cta.label} <b>↗</b></Link>
    </div>
    {menu && <div className="mega-menu">
      <div>
        <p>Продукт</p>
        <Link href="/#experience">Дневник питания <b>→</b></Link>
        <Link href="/raschet/plan">Персональный план <b>→</b></Link>
        <Link href="/#experience">Прогресс и привычки <b>→</b></Link>
      </div>
      <div>
        <p>Решения</p>
        <Link href="/#specialists">Для себя <b>→</b></Link>
        <Link href="/pro">Для специалистов <b>→</b></Link>
        <Link href="/skolko-kalorij">Калькуляторы <b>→</b></Link>
      </div>
      <aside>Считает по фотографии.<br /><em>Работает в Telegram.</em></aside>
    </div>}
  </header>;
}

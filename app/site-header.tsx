"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { hasLinks, isDirectLink, NAV_SECTIONS, type NavSection } from "@/lib/site-nav";
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
 * ## Одно состояние на два раздела — так было и так не работало
 *
 * Состояние называлось `menu` и было булевым: открыто или нет. Панель при
 * этом была одна и показывала оба списка сразу, поэтому «Продукт» и
 * «Решения» открывали одно и то же — разделов как будто и не существовало.
 * Теперь в состоянии лежит подпись открытого раздела, а панель показывает
 * ссылки только этого раздела.
 *
 * Из того же корня росла и вторая странность: перейдя табом с «Решений» на
 * «Журнал», человек оставлял панель открытой — закрывать её было некому,
 * потому что `onFocus` стоял только на разделах с меню. Теперь фокус на
 * любом пункте задаёт состояние явно: у раздела с панелью — свою подпись,
 * у якорного — пусто.
 *
 * ## Про ссылки на разделы
 *
 * Разделы «Журнал» и «О нас» живут якорями на главной. На самой главной по
 * ним плавно прокручиваем, с других страниц — переходим. Одно и то же
 * поведение везде выглядело бы поломкой: на главной перезагрузка ради
 * прокрутки, на других страницах прокрутка в никуда.
 */

export type HeaderCta = { href: string; label: string };

const DEFAULT_CTA: HeaderCta = { href: "/register", label: "Начать" };

/** Прокрутка, если раздел на этой же странице; иначе — обычный переход. */
function goToSection(anchor: string) {
  const target = document.getElementById(anchor);
  if (target) target.scrollIntoView({ behavior: "smooth" });
  else window.location.assign(`/#${anchor}`);
}

/** Идентификатор панели — чтобы кнопка могла на неё сослаться для читалок. */
function panelId(section: NavSection) {
  return `nav-panel-${NAV_SECTIONS.indexOf(section)}`;
}

export function SiteHeader({ cta = DEFAULT_CTA }: { cta?: HeaderCta }) {
  /** Подпись открытого раздела — или null, если ничего не открыто. */
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  const opened = NAV_SECTIONS.find((section) => section.label === open);
  const panel = opened && hasLinks(opened) ? opened : null;

  function closeAll() {
    setOpen(null);
    setDrawer(false);
  }

  return <header
    className="site-header"
    // Меню закрывается, когда курсор уходит со всей шапки: сама выпадающая
    // панель лежит внутри неё, поэтому переход с пункта на панель разрывом
    // не считается. Escape — для тех, кто пришёл с клавиатуры.
    onMouseLeave={() => setOpen(null)}
    onKeyDown={(event) => { if (event.key === "Escape") closeAll(); }}
  >
    <Link className="logo" href="/" onClick={closeAll}><span><Logo /></span>Живое Тело</Link>
    <nav className="main-nav" aria-label="Навигация">
      {NAV_SECTIONS.map((section) => hasLinks(section)
        ? <button
            key={section.label}
            aria-expanded={open === section.label}
            aria-controls={panelId(section)}
            // Наведение — основной способ, но не единственный: на телефоне
            // его нет вовсе, а с клавиатуры до меню добираются табом.
            onMouseEnter={() => setOpen(section.label)}
            onFocus={() => setOpen(section.label)}
            onClick={() => setOpen(open === section.label ? null : section.label)}
          >{section.label}<small>⌄</small></button>
        : isDirectLink(section)
        ? <Link
            key={section.label}
            href={section.href}
            onMouseEnter={() => setOpen(null)}
            onFocus={() => setOpen(null)}
            onClick={closeAll}
          >{section.label}</Link>
        : <button
            key={section.label}
            // Фокус здесь закрывает панель так же, как и наведение: иначе
            // переход табом с «Решений» оставлял её висеть.
            onMouseEnter={() => setOpen(null)}
            onFocus={() => setOpen(null)}
            onClick={() => { setOpen(null); goToSection(section.anchor); }}
          >{section.label}</button>)}
    </nav>
    <div className="header-actions">
      <Link className="login" href="/login">Войти</Link>
      <Link className="header-cta" href={cta.href}>{cta.label} <b>↗</b></Link>
      {/* Гамбургер — единственная навигация на телефоне: .main-nav и «Войти»
          там спрятаны шириной, и до этой правки попасть с телефона было
          некуда, кроме как по логотипу на главную. */}
      <button
        className="burger"
        aria-expanded={drawer}
        aria-controls="nav-drawer"
        aria-label={drawer ? "Закрыть меню" : "Открыть меню"}
        onClick={() => setDrawer(!drawer)}
      >{drawer ? "✕" : "☰"}</button>
    </div>

    {panel && <div className="mega-menu" id={panelId(panel)}>
      <div>
        <p>{panel.label}</p>
        {panel.links.map((link) => <Link key={link.label} href={link.href} onClick={closeAll}>
          {link.label} <b>→</b>
        </Link>)}
      </div>
      <figure className="mega-art">
        <Image src={panel.art.src} alt={panel.art.alt} width={1120} height={460} />
        <figcaption>{panel.art.caption}<br /><em>{panel.art.accent}</em></figcaption>
      </figure>
    </div>}

    {drawer && <div className="nav-drawer" id="nav-drawer">
      {NAV_SECTIONS.map((section) => hasLinks(section)
        // На телефоне раскрывать нечего: экран и так вертикальный, и лишнее
        // касание ради списка из трёх ссылок — плата ни за что.
        ? <section key={section.label}>
            <p>{section.label}</p>
            {section.links.map((link) => <Link key={link.label} href={link.href} onClick={closeAll}>
              {link.label} <b>→</b>
            </Link>)}
          </section>
        : isDirectLink(section)
        ? <Link key={section.label} href={section.href} onClick={closeAll}>
            {section.label} <b>→</b>
          </Link>
        : <button key={section.label} onClick={() => { closeAll(); goToSection(section.anchor); }}>
            {section.label} <b>→</b>
          </button>)}
      <Link className="drawer-login" href="/login" onClick={closeAll}>Войти</Link>
    </div>}
  </header>;
}

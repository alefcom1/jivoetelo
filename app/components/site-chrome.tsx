"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type SiteIconName =
  | "spark"
  | "camera"
  | "voice"
  | "arrow"
  | "check"
  | "leaf"
  | "chart"
  | "users"
  | "book"
  | "shield"
  | "recipe"
  | "target"
  | "menu"
  | "close"
  | "chevron";

export function SiteIcon({ name, size = 20 }: { name: SiteIconName; size?: number }) {
  const icons: Record<SiteIconName, React.ReactNode> = {
    spark: <><path d="M12 2l1.45 5.05L18.5 8.5l-5.05 1.45L12 15l-1.45-5.05L5.5 8.5l5.05-1.45L12 2Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></>,
    camera: <><path d="M4 7h3l1.4-2h7.2L17 7h3v12H4V7Z"/><circle cx="12" cy="13" r="4"/></>,
    voice: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    leaf: <><path d="M20 4C12 4 5 8 5 15c0 3 2 5 5 5 7 0 10-8 10-16Z"/><path d="M4 21c4-6 8-9 13-12"/></>,
    chart: <><path d="M4 19V5M4 19h16"/><path d="m7 15 4-5 3 2 5-7"/></>,
    users: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6M14 15c3.5-.5 6 1 7 4"/></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v18H7.5A3.5 3.5 0 0 0 4 23V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v18h3.5A3.5 3.5 0 0 1 20 23V5.5Z"/></>,
    shield: <><path d="M12 3 20 6v6c0 5-3.2 8-8 10-4.8-2-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
    recipe: <><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M18 6 22 2M18 2h4v4"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    chevron: <path d="m8 10 4 4 4-4"/>,
  };

  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

export function Brand() {
  return <span className="brand"><span className="brand-mark"><i/><i/><i/></span><b>JIVELO</b></span>;
}

const productGroups = [
  {
    label: "Записать и понять",
    items: [
      { href: "/ai-food-camera", icon: "camera" as const, title: "AI-камера", text: "Распознавание блюда с честной оценкой точности" },
      { href: "/product#multimodal", icon: "voice" as const, title: "Быстрый дневник", text: "Фото, голос, текст, штрихкод и недавние блюда" },
      { href: "/product#quality", icon: "shield" as const, title: "Проверенная база", text: "Источники, верификация и понятные порции" },
    ],
  },
  {
    label: "Спланировать дальше",
    items: [
      { href: "/what-to-eat", icon: "spark" as const, title: "Что съесть сейчас?", text: "Идеи с учётом дня, голода, времени и бюджета" },
      { href: "/adaptive-plan", icon: "chart" as const, title: "Адаптивный план", text: "Цели, которые уточняются по реальной динамике" },
      { href: "/product#progress", icon: "target" as const, title: "Спокойный прогресс", text: "Тренд вместо тревоги из-за ежедневных колебаний" },
    ],
  },
];

const solutionGroups = [
  {
    label: "Кому помогает JIVELO",
    items: [
      { href: "/product", icon: "leaf" as const, title: "Для себя", text: "Ежедневный навигатор питания без давления" },
      { href: "/pro", icon: "users" as const, title: "Для специалистов", text: "Клиенты, дневники, цели и отчёты в одном SaaS" },
      { href: "/pro#teams", icon: "target" as const, title: "Для клиник и команд", text: "Организации, группы и программы сопровождения" },
    ],
  },
  {
    label: "Узнать больше",
    items: [
      { href: "/science", icon: "book" as const, title: "Методология", text: "Как считаются цели, тренд и уверенность AI" },
      { href: "/recipes", icon: "recipe" as const, title: "Рецепты", text: "Красивые идеи, которые легко вписать в день" },
      { href: "/security", icon: "shield" as const, title: "Безопасность", text: "Контроль данных, согласия и приватность" },
    ],
  },
];

function MegaLink({ item, current }: { item: { href: string; icon: SiteIconName; title: string; text: string }; current: string }) {
  const path = item.href.split("#")[0];
  const active = path === "/" ? current === "/" : current === path || current.startsWith(`${path}/`);
  return <Link href={item.href} className={active ? "mega-link active" : "mega-link"}>
    <span><SiteIcon name={item.icon} size={19}/></span>
    <div><b>{item.title}</b><small>{item.text}</small></div>
    <SiteIcon name="arrow" size={16}/>
  </Link>;
}

function MegaMenu({ type, current, close }: { type: "product" | "solutions"; current: string; close: () => void }) {
  const groups = type === "product" ? productGroups : solutionGroups;
  return <div className="mega-wrap" role="dialog" aria-label={type === "product" ? "Меню продукта" : "Меню решений"}>
    <div className="mega-menu-panel">
      <div className="mega-columns">
        {groups.map(group => <section key={group.label}>
          <p>{group.label}</p>
          {group.items.map(item => <MegaLink item={item} current={current} key={item.href} />)}
        </section>)}
      </div>
      <Link href={type === "product" ? "/what-to-eat" : "/pro"} className={type === "product" ? "mega-feature meal" : "mega-feature pro-card"} onClick={close}>
        <div className="mega-feature-top"><span><SiteIcon name={type === "product" ? "spark" : "users"} size={17}/>{type === "product" ? "JIVELO рекомендует" : "JIVELO Pro"}</span><SiteIcon name="arrow" size={18}/></div>
        {type === "product" ? <>
          <div className="mega-meal-photo"><i>42 г</i><i>18 мин</i></div>
          <h3>Ужин, который подходит именно сегодняшнему дню</h3>
          <p>Остаток: 680 ккал · фокус: белок и клетчатка</p>
        </> : <>
          <div className="mega-pro-chart"><i/><i/><i/><i/><i/></div>
          <h3>Спокойная картина по каждому клиенту</h3>
          <p>Дневник, прогресс, сообщения и недельные обзоры.</p>
        </>}
      </Link>
    </div>
  </div>;
}

export function SiteHeader() {
  const current = usePathname();
  const [openMenu, setOpenMenu] = useState<"product" | "solutions" | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpenMenu(null); setMobileOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [current]);

  return <header className="site-nav-header" onMouseLeave={() => setOpenMenu(null)}>
    <div className="nav-shell">
      <Link href="/" className="site-logo" aria-label="JIVELO — на главную"><Brand/></Link>
      <nav className="desktop-nav" aria-label="Основная навигация">
        <button className={openMenu === "product" ? "active" : ""} onMouseEnter={() => setOpenMenu("product")} onFocus={() => setOpenMenu("product")} onClick={() => setOpenMenu(openMenu === "product" ? null : "product")} aria-expanded={openMenu === "product"}>Продукт <SiteIcon name="chevron" size={15}/></button>
        <button className={openMenu === "solutions" ? "active" : ""} onMouseEnter={() => setOpenMenu("solutions")} onFocus={() => setOpenMenu("solutions")} onClick={() => setOpenMenu(openMenu === "solutions" ? null : "solutions")} aria-expanded={openMenu === "solutions"}>Решения <SiteIcon name="chevron" size={15}/></button>
        <Link href="/pro" className={current.startsWith("/pro") ? "active" : ""}>Для специалистов</Link>
        <Link href="/pricing" className={current.startsWith("/pricing") ? "active" : ""}>Тарифы</Link>
        <Link href="/science" className={current.startsWith("/science") ? "active" : ""}>Методология</Link>
      </nav>
      <div className="site-nav-actions">
        <Link href="/login" className="site-login">Войти</Link>
        <Link href="/register" className="nav-primary">Начать бесплатно <SiteIcon name="arrow" size={16}/></Link>
        <button className="mobile-menu-button" aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><SiteIcon name={mobileOpen ? "close" : "menu"}/></button>
      </div>
    </div>
    {openMenu && !mobileOpen && <MegaMenu type={openMenu} current={current} close={() => setOpenMenu(null)} />}
    {mobileOpen && <div className="mobile-navigation">
      <div className="mobile-nav-scroll">
        <p>Продукт</p>
        {[...productGroups[0].items, ...productGroups[1].items].map(item => <MegaLink key={item.href} item={item} current={current}/>) }
        <p>Решения и ресурсы</p>
        {[...solutionGroups[0].items, ...solutionGroups[1].items].map(item => <MegaLink key={item.href} item={item} current={current}/>) }
        <div className="mobile-nav-direct"><Link href="/pricing">Тарифы</Link><Link href="/articles">Журнал</Link><Link href="/contact">Контакты</Link></div>
        <Link href="/register" className="nav-primary mobile-full">Начать бесплатно <SiteIcon name="arrow" size={17}/></Link>
      </div>
    </div>}
  </header>;
}

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="shell site-footer-main">
      <div className="site-footer-brand"><Brand/><h2>Питание в ритме<br/><em>вашего тела.</em></h2><p>Красивый и честный AI-навигатор питания для людей и специалистов.</p></div>
      <div><b>Продукт</b><Link href="/ai-food-camera">AI-камера</Link><Link href="/what-to-eat">Что съесть сейчас</Link><Link href="/adaptive-plan">Адаптивный план</Link><Link href="/pricing">Тарифы</Link></div>
      <div><b>Решения</b><Link href="/product">Для себя</Link><Link href="/pro">Для специалистов</Link><Link href="/pro#teams">Для клиник</Link><Link href="/recipes">Рецепты</Link></div>
      <div><b>Компания</b><Link href="/science">Методология</Link><Link href="/security">Безопасность</Link><Link href="/articles">Журнал</Link><Link href="/contact">Контакты</Link></div>
    </div>
    <div className="shell site-footer-bottom"><span>© JIVELO, 2026</span><Link href="/privacy">Конфиденциальность</Link><Link href="/terms">Условия</Link><Link href="/">jivoetelo.ru</Link></div>
  </footer>;
}

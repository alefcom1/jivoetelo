import Link from "next/link";
import { SiteIcon, type SiteIconName } from "./site-chrome";

export function PageEyebrow({ icon = "spark", children, light = false }: { icon?: SiteIconName; children: React.ReactNode; light?: boolean }) {
  return <div className={light ? "eyebrow light" : "eyebrow"}><SiteIcon name={icon} size={15}/>{children}</div>;
}

export function PageHero({
  eyebrow,
  icon = "spark",
  title,
  accent,
  text,
  primary = "Начать бесплатно",
  primaryHref = "/register",
  secondary,
  secondaryHref,
  visual,
  theme = "light",
}: {
  eyebrow: string;
  icon?: SiteIconName;
  title: React.ReactNode;
  accent?: React.ReactNode;
  text: string;
  primary?: string;
  primaryHref?: string;
  secondary?: string;
  secondaryHref?: string;
  visual: React.ReactNode;
  theme?: "light" | "dark" | "blue";
}) {
  return <section className={`inner-hero ${theme}`}>
    <div className="shell inner-hero-grid">
      <div className="inner-hero-copy">
        <PageEyebrow icon={icon} light={theme !== "light"}>{eyebrow}</PageEyebrow>
        <h1>{title}{accent && <><br/><em>{accent}</em></>}</h1>
        <p>{text}</p>
        <div className="inner-hero-actions">
          <Link className={theme === "light" ? "button large" : "button light large"} href={primaryHref}>{primary}<SiteIcon name="arrow"/></Link>
          {secondary && secondaryHref && <Link className="inner-text-link" href={secondaryHref}>{secondary}<SiteIcon name="arrow" size={16}/></Link>}
        </div>
      </div>
      <div className="inner-hero-visual">{visual}</div>
    </div>
  </section>;
}

export function PageIntro({ eyebrow, icon = "spark", title, text, align = "split" }: { eyebrow: string; icon?: SiteIconName; title: React.ReactNode; text: string; align?: "split" | "center" }) {
  return <div className={`page-intro ${align}`}>
    <div><PageEyebrow icon={icon}>{eyebrow}</PageEyebrow><h2>{title}</h2></div>
    <p>{text}</p>
  </div>;
}

export function FeatureGrid({ items, className = "" }: { items: { number?: string; icon: SiteIconName; title: string; text: string; meta?: string }[]; className?: string }) {
  return <div className={`feature-grid ${className}`}>{items.map((item, index) => <article key={item.title}>
    <div className="feature-icon"><SiteIcon name={item.icon}/></div>
    <span>{item.number ?? String(index + 1).padStart(2, "0")}</span>
    <h3>{item.title}</h3>
    <p>{item.text}</p>
    {item.meta && <small>{item.meta}</small>}
  </article>)}</div>;
}

export function PageCta({ eyebrow = "Начните с одного приёма пищи", title, text, button = "Получить ранний доступ", href = "/register" }: { eyebrow?: string; title: React.ReactNode; text: string; button?: string; href?: string }) {
  return <section className="page-cta shell"><div>
    <div className="page-cta-copy"><PageEyebrow icon="leaf">{eyebrow}</PageEyebrow><h2>{title}</h2><p>{text}</p><Link href={href} className="button large">{button}<SiteIcon name="arrow"/></Link></div>
    <div className="page-cta-visual" aria-hidden="true">
      <div className="cta-meal-photo"><span><SiteIcon name="camera" size={15}/> AI-анализ готов</span><i>Высокая уверенность</i></div>
      <div className="cta-daily-card"><small>ОСТАЛОСЬ СЕГОДНЯ</small><strong>684 <i>ккал</i></strong><div><span><b>42 г</b> белка</span><span><b>9 г</b> клетчатки</span></div></div>
      <div className="cta-next-card"><span><SiteIcon name="spark" size={16}/></span><div><small>СЛЕДУЮЩИЙ ШАГ</small><b>Подобрать ужин на 15 минут</b></div></div>
    </div>
  </div></section>;
}

import Link from "next/link";
import { LEGAL_PAGES, LEGAL_UPDATED_AT, LEGAL_VERSION } from "@/lib/legal";

/**
 * Дата в человеческом виде: «28 июля 2026 года». Собираем по частям, а не
 * добавляем «года» к готовой строке: Intl отдаёт «2026 г.», и получалось бы
 * «2026 г. года».
 */
export function formatLegalDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")} года`;
}

export function LegalMeta() {
  return <p className="legal-meta">
    <span>Редакция {LEGAL_VERSION}</span>
    <span>Действует с {formatLegalDate(LEGAL_UPDATED_AT)}</span>
  </p>;
}

/** Переход между документами: их читают вместе, а не по одному. */
export function LegalNav({ current }: { current: string }) {
  return <nav className="legal-nav">
    {LEGAL_PAGES.map((page) => (
      <Link key={page.href} href={page.href} className={page.href === current ? "current" : undefined}>
        {page.title}
      </Link>
    ))}
  </nav>;
}

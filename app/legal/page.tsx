import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_UPDATED_AT, NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { formatLegalDate, LegalMeta } from "./nav";

export const metadata: Metadata = {
  title: "Документы — Живое Тело",
  description: "Соглашение, политика конфиденциальности, согласие на обработку данных и cookie.",
  alternates: { canonical: "/legal" },
};

const documents = [
  {
    href: "/legal/terms",
    title: "Пользовательское соглашение",
    summary: "На каких условиях работает сервис, чего он не делает и почему расчёты приблизительны.",
  },
  {
    href: "/legal/privacy",
    title: "Политика конфиденциальности",
    summary: "Какие данные мы обрабатываем, зачем, сколько храним и как их забрать или удалить.",
  },
  {
    href: "/legal/consent",
    title: "Согласие на обработку персональных данных",
    summary: "Текст согласия, которое вы даёте отметкой при регистрации.",
  },
  {
    href: "/legal/health",
    title: "Медицинский дисклеймер",
    summary: "Где границы сервиса, когда сначала к врачу и что мы делаем, чтобы не навредить.",
  },
  {
    href: "/legal/cookies",
    title: "Файлы cookie",
    summary: "Один строго необходимый cookie и ни одного трекера — почему у нас нет баннера.",
  },
];

export default function LegalIndexPage() {
  return <article className="legal-doc">
    <p className="kicker">Документы <i /></p>
    <h1>Договорённости<br /><em>без мелкого шрифта.</em></h1>
    <LegalMeta />

    <div className="legal-callout">
      <p>{NOT_MEDICAL_DISCLAIMER}</p>
    </div>

    <div className="legal-index">
      {documents.map((doc) => (
        <Link key={doc.href} href={doc.href}>
          <span><b>{doc.title}</b><span>{doc.summary}</span></span>
          <b>→</b>
        </Link>
      ))}
    </div>

    <p style={{ marginTop: 32 }}>Все документы в редакции от {formatLegalDate(LEGAL_UPDATED_AT)}. Если что-то в них непонятно — напишите нам, и мы перепишем это место понятнее.</p>
  </article>;
}

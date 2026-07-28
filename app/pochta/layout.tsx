import Link from "next/link";
// Оболочка и типографика те же, что у юридических страниц: отписка — такая
// же служебная страница, куда попадают по ссылке из письма, и заводить ради
// неё отдельный набор стилей незачем.
import "../legal/legal.css";

export default function PochtaLayout({ children }: { children: React.ReactNode }) {
  return <div className="legal-shell">
    <header className="legal-header">
      <Link className="logo" href="/"><span>Ж</span>Живое Тело</Link>
      <Link className="back" href="/">На главную →</Link>
    </header>
    {children}
  </div>;
}

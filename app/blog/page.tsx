import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLES, formatArticleDate } from "@/lib/articles";
import { breadcrumbsJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/schema-org";
import { ArticleHero } from "./heroes";

/** Русское склонение после числа: «1 статья», «2 статьи», «104 статьи». */
function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export const metadata: Metadata = {
  title: "Журнал: как устроен честный подсчёт калорий — Живое Тело",
  description:
    "Статьи о том, как работает «Живое Тело»: разбор еды по фото, честные диапазоны вместо точных чисел, норма по тренду веса и сравнения с другими приложениями.",
  alternates: { canonical: "/blog" },
};

export default function BlogHubPage() {
  // Две крупные и остальные по четыре в ряд. Одна огромная карточка наверху
  // отдавала первой статье весь первый экран; две дают выбор, а выбор — то,
  // ради чего на хаб журнала и приходят.
  const [first, second, ...rest] = ARTICLES;
  const lead = [first, second].filter(Boolean);

  return <main className="blog-hub">
    <header className="blog-hub-head">
      <div>
        <p className="kicker">Журнал <i /></p>
        <h1>О еде — честно и по делу.</h1>
      </div>
      <p className="blog-hub-lead">
        Здесь мы объясняем, как устроен сервис и почему он считает именно так: без обещаний
        «минус десять к лету», зато с настоящими скриншотами, графиками на наших данных и
        сравнениями, в которых мы выигрываем не все строки.
      </p>
      <p className="blog-hub-count">{ARTICLES.length} {plural(ARTICLES.length, "статья", "статьи", "статей")}</p>
    </header>

    <div className="blog-lead">
      {lead.map((article) => <Link className="blog-lead-card" key={article.slug} href={`/blog/${article.slug}`}>
        <span className="blog-lead-hero" aria-hidden>
          <ArticleHero slug={article.slug} image={article.heroImage} alt="" />
        </span>
        <span className="blog-meta">
          <span>{article.kicker}</span><i /><span>{article.minutes} мин</span>
        </span>
        <span className="blog-lead-title">{article.title}</span>
        <p>{article.description}</p>
        <span className="blog-lead-foot">
          <span className="blog-date">{formatArticleDate(article.published)}</span>
          <span className="blog-featured-more">Читать статью →</span>
        </span>
      </Link>)}
    </div>

    <div className="blog-grid">
      {rest.map((article) => <Link className="blog-card" key={article.slug} href={`/blog/${article.slug}`}>
        <span className="blog-card-hero" aria-hidden>
          <ArticleHero slug={article.slug} image={article.heroImage} alt="" card />
        </span>
        <span className="blog-meta">
          <span>{article.kicker}</span><i /><span>{article.minutes} мин</span>
        </span>
        <span className="blog-card-title">{article.titleShort}</span>
        <p>{article.description}</p>
        <span className="blog-date">{formatArticleDate(article.published)}</span>
      </Link>)}
    </div>

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdScript([
          itemListJsonLd({
            name: "Журнал «Живого Тела»",
            items: ARTICLES.map((article) => ({ name: article.title, path: `/blog/${article.slug}` })),
          }),
          breadcrumbsJsonLd([{ name: "Журнал", path: "/blog" }]),
        ]),
      }}
    />
  </main>;
}

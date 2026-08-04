import type { Metadata } from "next";
import Link from "next/link";
import { ARTICLES, formatArticleDate } from "@/lib/articles";
import { breadcrumbsJsonLd, itemListJsonLd, jsonLdScript } from "@/lib/schema-org";
import { ArticleHero } from "./heroes";

export const metadata: Metadata = {
  title: "Журнал: как устроен честный подсчёт калорий — Живое Тело",
  description:
    "Статьи о том, как работает «Живое Тело»: разбор еды по фото, честные диапазоны вместо точных чисел, норма по тренду веса и сравнения с другими приложениями.",
  alternates: { canonical: "/blog" },
};

export default function BlogHubPage() {
  const [featured, ...rest] = ARTICLES;

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
    </header>

    <Link className="blog-featured" href={`/blog/${featured.slug}`}>
      <span className="blog-featured-hero" aria-hidden>
        <ArticleHero slug={featured.slug} image={featured.heroImage} alt="" />
      </span>
      <span className="blog-featured-copy">
        <span className="blog-meta">
          <span>{featured.kicker}</span><i /><span>{featured.minutes} мин</span>
        </span>
        <span className="blog-card-title">{featured.title}</span>
        <span>
          <p>{featured.description}</p>
          <span className="blog-date">{formatArticleDate(featured.published)}</span>
          <span className="blog-featured-more">Читать статью →</span>
        </span>
      </span>
    </Link>

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

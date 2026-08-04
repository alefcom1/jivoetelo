import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICLES, findArticle, formatArticleDate } from "@/lib/articles";
import { NOT_MEDICAL_DISCLAIMER } from "@/lib/legal";
import { blogPostingJsonLd, breadcrumbsJsonLd, jsonLdScript } from "@/lib/schema-org";
import { ArticleHero } from "../heroes";

import KakUstroen from "../content/kak-ustroen-dnevnik-po-foto";
import Sravnenie from "../content/sravnenie-prilozhenij-dlya-podscheta-kalorij";
import Telegram from "../content/dnevnik-pitaniya-v-telegram";
import Diapazon from "../content/pochemu-diapazon-chestnee-tochnogo-chisla";
import Norma from "../content/norma-kalorij-kotoraya-uchitsya";

/**
 * Тексты статей — компоненты, а не markdown: им нужны скриншоты с
 * подписями, SVG-графики на данных из lib/ и таблицы. Реестр (lib/articles.ts)
 * даёт метаданные; соответствие slug → текст собрано здесь, и тест
 * tests/articles.test.mjs следит, чтобы ни одна статья не осталась без текста.
 */
const CONTENT: Record<string, () => React.ReactElement> = {
  "kak-ustroen-dnevnik-po-foto": KakUstroen,
  "sravnenie-prilozhenij-dlya-podscheta-kalorij": Sravnenie,
  "dnevnik-pitaniya-v-telegram": Telegram,
  "pochemu-diapazon-chestnee-tochnogo-chisla": Diapazon,
  "norma-kalorij-kotoraya-uchitsya": Norma,
};

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const article = findArticle((await params).slug);
  if (!article) return {};
  return {
    title: `${article.title} — Живое Тело`,
    description: article.description,
    alternates: { canonical: `/blog/${article.slug}` },
    openGraph: article.heroImage
      ? { type: "article", title: article.title, images: [{ url: article.heroImage, alt: article.heroAlt }] }
      : { type: "article", title: article.title },
  };
}

export default async function ArticlePage({ params }: Params) {
  const article = findArticle((await params).slug);
  if (!article) notFound();
  const Content = CONTENT[article.slug];
  if (!Content) notFound();

  // «Читайте также»: следующие по кругу две статьи — у каждой страницы свои,
  // чтобы перелинковка покрывала весь журнал без ручной разметки связей.
  const index = ARTICLES.findIndex((candidate) => candidate.slug === article.slug);
  const related = [1, 2].map((step) => ARTICLES[(index + step) % ARTICLES.length]);

  return <main className="blog-article">
    <p className="kicker">
      <Link href="/blog">Журнал</Link> · {article.kicker} <i />
    </p>
    <h1>{article.title}</h1>
    <p className="blog-meta blog-article-meta">
      <span>{formatArticleDate(article.published)}</span>·<span>{article.minutes} мин чтения</span>
    </p>
    <p className="blog-article-lead">{article.lead}</p>

    <figure className="blog-article-hero" aria-hidden>
      <ArticleHero slug={article.slug} image={article.heroImage} alt={article.heroAlt} />
    </figure>

    <Content />

    <aside className="blog-cta">
      <h2>Попробуйте на своей тарелке</h2>
      <p>
        Всё описанное — не планы, а работающий сервис: дневник по фото, честные диапазоны и
        план, который подстраивается по вашим данным. Бесплатно.
      </p>
      <Link className="black-button" href="/register">Начать бесплатно <b>↗</b></Link>
    </aside>

    <section className="blog-related">
      <h2>Читайте также</h2>
      <div className="blog-related-grid">
        {related.map((item) => <Link className="blog-card" key={item.slug} href={`/blog/${item.slug}`}>
          <span className="blog-meta">
            <span>{item.kicker}</span>·<span>{item.minutes} мин</span>
          </span>
          <span className="blog-card-title">{item.titleShort}</span>
          <p>{item.description}</p>
        </Link>)}
      </div>
    </section>

    <p className="blog-disclaimer field-note">
      {NOT_MEDICAL_DISCLAIMER} <Link href="/legal/health">Подробнее о границах сервиса →</Link>
    </p>

    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdScript([
          blogPostingJsonLd({
            title: article.title,
            description: article.description,
            path: `/blog/${article.slug}`,
            published: article.published,
            image: article.heroImage,
          }),
          breadcrumbsJsonLd([
            { name: "Журнал", path: "/blog" },
            { name: article.titleShort, path: `/blog/${article.slug}` },
          ]),
        ]),
      }}
    />
  </main>;
}

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
import Disciplina from "../content/myagkaya-disciplina-dlya-tela";
import Sahar from "../content/kak-umenshit-skachki-sahara-posle-edy";
import RazniyeCifry from "../content/pochemu-u-odnogo-blyuda-v-raznyh-prilozheniyah-raznaya-kalor";
import Grechka from "../content/grechka-92-ili-330-kkal-kak-odno-chislo-lomaet-polovinu-pods";
import TriKilogramma from "../content/tri-kilogramma-kotorye-ne-zhir-chto-pokazyvayut-vesy-na-samo";
import Sozhgla from "../content/sozhgla-na-trenirovke-samaya-dorogaya-oshibka-v-podschete";

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
  "myagkaya-disciplina-dlya-tela": Disciplina,
  "kak-umenshit-skachki-sahara-posle-edy": Sahar,
  "pochemu-u-odnogo-blyuda-v-raznyh-prilozheniyah-raznaya-kalor": RazniyeCifry,
  "grechka-92-ili-330-kkal-kak-odno-chislo-lomaet-polovinu-pods": Grechka,
  "tri-kilogramma-kotorye-ne-zhir-chto-pokazyvayut-vesy-na-samo": TriKilogramma,
  "sozhgla-na-trenirovke-samaya-dorogaya-oshibka-v-podschete": Sozhgla,
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

    {/* Кто это написал и на чём стоит.
        Автор — редакция, а не выдуманное имя эксперта: тексты пишет и
        вычитывает команда сервиса, и приписывать их несуществующему
        диетологу было бы ровно тем враньём, против которого статьи и
        написаны. Зато проверяемо всё остальное: методика открыта
        отдельной страницей, числа взяты из кода, источники названы. */}
    <section className="blog-byline">
      <h2>Кто это написал</h2>
      {/* Формулировка была «все числа в статье взяты из работающего кода» —
          верная, пока журнал состоял из текстов про нашу же механику. Первая
          статья не про продукт (про привычки) сделала её неправдой: числа там
          из чужих работ. Утверждение теперь ровно такое, каким может быть для
          любой статьи, а внешнее подпирается списком источников ниже. */}
      <p>
        Текст подготовила редакция «Живого Тела» — команда, которая делает сам сервис.
        Числа нашего сервиса берутся в статьях из работающего кода, а не из общих
        соображений: методика расчётов открыта целиком на странице{" "}
        <Link href="/kak-schitaem">«Как мы считаем»</Link>, и любую такую цифру можно сверить
        с ней.{article.sources.length > 0 && " Всё, что взято извне, названо в источниках."}
      </p>
      <p className="blog-byline-dates">
        Опубликовано {formatArticleDate(article.published)}
        {article.updated !== article.published && <> · обновлено {formatArticleDate(article.updated)}</>}
      </p>
      {article.disclosure && <p className="blog-disclosure">
        <strong>Раскрытие.</strong> {article.disclosure}
      </p>}
      {article.sources.length > 0 && <>
        <h3>Источники</h3>
        <ul className="blog-sources">
          {article.sources.map((source) => <li key={source.url}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
          </li>)}
        </ul>
      </>}
      <p className="blog-byline-note">
        Нашли неточность или устаревшее? Напишите — <a href="mailto:privacy@jivoetelo.ru">privacy@jivoetelo.ru</a>.
        Поправим и отметим дату обновления.
      </p>
    </section>

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
            updated: article.updated,
            section: article.kicker,
            image: article.heroImage,
            sources: article.sources,
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

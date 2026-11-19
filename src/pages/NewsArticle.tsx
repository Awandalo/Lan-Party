import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import NewsReactions from '../components/NewsReactions';
import { NewsReading } from '../components/NewsReading';
import PollVoting from '../components/PollVoting';
import PublicShare from '../components/PublicShare';
import { useNews } from '../lib/news';
import { newsLanguage } from '../lib/news-language';
import '../CSS/News_style.css';

export default function NewsArticle() {
  const { slug } = useParams();
  const { data, loading, error } = useNews('/api/news/' + encodeURIComponent(slug ?? ''));
  const article = data?.article?.slug === slug ? data?.article : undefined;
  const waiting = loading || (!!data?.article && !article);
  useEffect(() => {
    document.title = 'LAN Party | ' + (article?.title ?? (waiting ? 'News' : 'Article unavailable'));
  }, [article, waiting]);

  const share = article && <PublicShare key={article.id} title={article.title}
    url={new URL('/news/' + article.slug, location.origin).href} />;
  return <article className="page-section news-page news-article">
    <Link className="text-link" to="/news">← All news</Link>
    {waiting ? <p role="status">Loading article…</p> : article ? <>
      <NewsReading article={article} />
      {article.poll ? <PollVoting article={article} actions={share} /> : share}
      <NewsReactions articleId={article.id} language={newsLanguage(article.language)} />
    </> : <>
      <h1>Article unavailable</h1>
      <p role="status">{error || 'This article is no longer published.'}</p>
    </>}
  </article>;
}

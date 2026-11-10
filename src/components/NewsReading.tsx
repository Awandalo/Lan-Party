import {Link} from 'react-router';
import type {NewsArticle} from '../lib/news';
import {newsDate} from '../lib/news';
import EventDescription from './EventDescription';
export function NewsCards({articles}:{articles:NewsArticle[]}){return <div className="news-card-grid">{articles.map(a=><article className="panel news-card" key={a.id}><p className="eyebrow">{a.publishedAt!==null?newsDate(a.publishedAt):'Draft'}</p><h2><Link to={'/news/'+a.slug}>{a.title}</Link></h2><p>{a.excerpt}</p><Link className="button button-secondary" to={'/news/'+a.slug}>Read article →</Link></article>)}</div>;}
export function NewsReading({article,preview=false}:{article:NewsArticle;preview?:boolean}){const Heading=preview?'h2':'h1';return <><p className="eyebrow">{article.publishedAt!==null?'Published '+newsDate(article.publishedAt):article.status==='archived'?'Unpublished':'Draft'}</p><Heading>{article.title}</Heading>{article.publishedAt!==null&&article.updatedAt>article.publishedAt&&<p className="news-updated">Updated on {newsDate(article.updatedAt)}{article.editorName?' by '+article.editorName:''}</p>}<EventDescription source={article.content??''}/></>;}

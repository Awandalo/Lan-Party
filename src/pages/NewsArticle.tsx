import {useEffect} from 'react';
import {Link,useParams} from 'react-router';
import {useNews} from '../lib/news';
import {NewsReading} from '../components/NewsReading';
import NewsPublicShare from '../components/NewsPublicShare';
import '../CSS/News_style.css';
export default function NewsArticle(){const {slug}=useParams(),state=useNews('/api/news/'+encodeURIComponent(slug??''));useEffect(()=>{document.title='LAN Party | '+(state.data?.article?.title??(state.loading?'News':'Article unavailable'));},[state.data,state.loading]);return <article className="page-section news-page news-article"><Link className="text-link" to="/news">← All news</Link>{state.loading?<p role="status">Loading article…</p>:state.data?.article?<><NewsReading article={state.data.article}/><NewsPublicShare key={state.data.article.id} title={state.data.article.title} url={new URL('/news/'+state.data.article.slug,location.origin).href}/></>:<><h1>Article unavailable</h1><p role="status">{state.error||'This article is no longer published.'}</p></>}</article>;}

import {useState} from 'react';
import {NewsCards} from '../components/NewsReading';
import {useNews} from '../lib/news';
import '../CSS/News_style.css';
export default function News(){const [page,setPage]=useState(0),state=useNews('/api/news?limit=12&offset='+page*12);return <section className="page-section news-page"><p className="eyebrow">From the crew</p><h1>News</h1><p>Announcements, practical updates and stories from your LAN Party crew.</p>{state.loading?<p role="status">Loading news…</p>:state.error?<p role="alert">{state.error}</p>:state.data?.articles?.length?<NewsCards articles={state.data.articles}/>:<p>No announcements published yet. Check back soon.</p>}<div className="news-pagination">{page>0&&<button className="button button-secondary" onClick={()=>setPage(p=>p-1)}>Newer posts</button>}{state.data?.hasMore&&<button className="button button-secondary" onClick={()=>setPage(p=>p+1)}>Older posts</button>}</div></section>;}

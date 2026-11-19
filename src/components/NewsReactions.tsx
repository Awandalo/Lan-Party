import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../lib/auth';
import { newsRequest } from '../lib/news';
import type { NewsLanguage } from '../lib/news-language';
import { reactionChoices, type NewsReaction, type NewsReactionState } from '../lib/news-reactions';
import './NewsReactions.css';

const labels = {
  en: { title: 'Reactions', loading: 'Loading reactions…', login: 'Log in to react', verify: 'Verify your email to react.',
    error: 'Reactions could not be confirmed.', retry: 'Refresh reactions', saved: 'Reaction saved.', removed: 'Reaction removed.' },
  nl: { title: 'Reacties', loading: 'Reacties laden…', login: 'Log in om te reageren', verify: 'Verifieer je e-mailadres om te reageren.',
    error: 'Reacties konden niet worden bevestigd.', retry: 'Reacties vernieuwen', saved: 'Reactie opgeslagen.', removed: 'Reactie verwijderd.' },
};

export default function NewsReactions({ articleId, language }: { articleId: string; language: NewsLanguage }) {
  const auth = useAuth();
  const proof = auth.session?.emailVerified ? auth.session.csrfToken : undefined;
  return <ReactionPicker key={`${articleId}:${proof ?? ''}`} articleId={articleId} language={language} proof={proof}
    signIn={auth.status === 'ready' && !auth.session} verifyEmail={!!auth.session && !auth.session.emailVerified} />;
}

function ReactionPicker({ articleId, language, proof, signIn, verifyEmail }: {
  articleId: string; language: NewsLanguage; proof?: string; signIn: boolean; verifyEmail: boolean;
}) {
  const copy = labels[language];
  const heading = useId();
  const endpoint = '/api/news-reactions/' + encodeURIComponent(articleId);
  const [data, setData] = useState<NewsReactionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<'saved' | 'removed' | null>(null);
  const [reload, setReload] = useState(0);
  const mutation = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    void newsRequest<NewsReactionState>(endpoint, proof, undefined, signal).then(state => {
      if (!controller.signal.aborted) setData(state);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
      mutation.current?.abort();
    };
  }, [endpoint, proof, reload]);

  async function select(choice: NewsReaction) {
    if (!data || !proof || mutation.current || failed) return;
    const controller = new AbortController();
    mutation.current = controller;
    setPending(true);
    setResult(null);
    const reaction = data.reaction === choice ? null : choice;
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      const next = await newsRequest<NewsReactionState>(endpoint, proof, { reaction }, signal);
      if (!controller.signal.aborted) {
        setData(next);
        setResult(reaction === null ? 'removed' : 'saved');
      }
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      mutation.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return <section className="news-reactions" lang={language} aria-labelledby={heading}>
    <h2 id={heading}>{copy.title}</h2>
    {data && <ul className="news-reaction-list" aria-busy={pending}>
      {reactionChoices.map(({ id, emoji, [language]: label }) => <li key={id}>
        {proof ? <button type="button" className="button button-secondary news-reaction"
          aria-label={`${label} · ${data.counts[id]}`} aria-pressed={data.reaction === id}
          aria-disabled={pending || failed} onClick={() => void select(id)}>
          <span aria-hidden="true">{emoji}</span><span aria-hidden="true">{data.counts[id]}</span>
        </button> : <span className="news-reaction">
          <span aria-hidden="true">{emoji}</span><span className="visually-hidden">{label} </span>{data.counts[id]}
        </span>}
      </li>)}
    </ul>}
    {signIn && data && <Link className="text-link" to="/login">{copy.login}</Link>}
    {verifyEmail && data && <p>{copy.verify}</p>}
    {loading && <p role="status">{copy.loading}</p>}
    {result && <p role="status">{copy[result]}</p>}
    {failed && <div>
      <p role="alert">{copy.error}</p>
      <button className="button button-secondary" type="button" onClick={() => {
        setData(null);
        setFailed(false);
        setLoading(true);
        setReload(current => current + 1);
      }}>{copy.retry}</button>
    </div>}
  </section>;
}

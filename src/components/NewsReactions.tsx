import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../lib/auth';
import { newsRequest } from '../lib/news';
import type { NewsLanguage } from '../lib/news-language';
import { reactionChoices, type NewsReaction, type NewsReactionState } from '../lib/news-reactions';
import './NewsReactions.css';

const labels = {
  en: { title: 'Reactions', like: 'Like', loading: 'Loading reactions…', login: 'Log in to react', verify: 'Verify your email to react.',
    error: 'Reactions could not be confirmed.', retry: 'Refresh reactions', saved: 'Reaction saved.', removed: 'Reaction removed.' },
  nl: { title: 'Reacties', like: 'Vind ik leuk', loading: 'Reacties laden…', login: 'Log in om te reageren', verify: 'Verifieer je e-mailadres om te reageren.',
    error: 'Reacties konden niet worden bevestigd.', retry: 'Reacties vernieuwen', saved: 'Reactie opgeslagen.', removed: 'Reactie verwijderd.' },
};

export default function NewsReactions({ articleId, language, actions }: { articleId: string; language: NewsLanguage; actions: ReactNode }) {
  const auth = useAuth();
  const proof = auth.session?.emailVerified ? auth.session.csrfToken : undefined;
  return <ReactionPicker key={`${articleId}:${proof ?? ''}`} articleId={articleId} language={language} proof={proof}
    signIn={auth.status === 'ready' && !auth.session} verifyEmail={!!auth.session && !auth.session.emailVerified} actions={actions} />;
}

function ReactionPicker({ articleId, language, proof, signIn, verifyEmail, actions }: {
  articleId: string; language: NewsLanguage; proof?: string; signIn: boolean; verifyEmail: boolean; actions: ReactNode;
}) {
  const copy = labels[language];
  const heading = useId();
  const pickerId = useId();
  const endpoint = '/api/news-reactions/' + encodeURIComponent(articleId);
  const [data, setData] = useState<NewsReactionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<'saved' | 'removed' | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);
  const mutation = useRef<AbortController | null>(null);
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!open) return;
    const choices = picker.current;
    (choices?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ??
      choices?.querySelector<HTMLButtonElement>('.news-reaction-option'))?.focus();
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  function closePicker() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  async function select(choice: NewsReaction) {
    if (!data || !proof || mutation.current || failed) return;
    closePicker();
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

  const selected = reactionChoices.find(({ id }) => id === data?.reaction);
  const total = data ? Object.values(data.counts).reduce((sum, count) => sum + count, 0) : 0;
  const publicReactions = !proof && data ? reactionChoices.filter(({ id }) => data.counts[id] > 0) : [];
  return <section className="news-reactions" lang={language} aria-labelledby={heading}>
    <h2 id={heading} className="visually-hidden">{copy.title}</h2>
    <div className="news-reaction-bar" aria-busy={pending}>
      {proof && data && <div className="news-reaction-picker" ref={picker}
        onBlur={event => {
          if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
        onKeyDown={event => {
          if (open && event.key === 'Escape') {
            event.preventDefault();
            closePicker();
          }
        }}>
        <button ref={trigger} type="button" className="button button-secondary news-reaction-trigger"
          data-selected={!!selected} aria-controls={pickerId} aria-expanded={open} aria-disabled={pending || failed}
          aria-label={`${selected?.[language] ?? copy.like} · ${copy.title}: ${total}`} title={selected?.[language] ?? copy.like}
          onClick={() => { if (!mutation.current && !failed) setOpen(value => !value); }}>
          {selected ? <span aria-hidden="true">{selected.emoji}</span> :
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 10h2l3-6a2 2 0 0 1 2 2v4h4a2 2 0 0 1 2 2.5l-1.5 6A2 2 0 0 1 17.6 20H8z" />
              <rect x="3" y="10" width="5" height="10" rx="1" />
            </svg>}
          <span aria-hidden="true">{total}</span>
        </button>
        <div id={pickerId} className="news-reaction-popover" hidden={!open}>
          <ul className="news-reaction-options" aria-label={copy.title}>
            {reactionChoices.map(({ id, emoji, [language]: label }) => <li key={id}>
              <button type="button" className="news-reaction-option" aria-label={`${label} · ${data.counts[id]}`}
                aria-pressed={data.reaction === id} title={label} onClick={() => void select(id)}>
                <span className="news-reaction-emoji" aria-hidden="true">{emoji}</span>
                <span aria-hidden="true">{data.counts[id]}</span>
              </button>
            </li>)}
          </ul>
        </div>
      </div>}
      {data && publicReactions.length > 0 && <ul className="news-reaction-summary" aria-label={copy.title}>
        {publicReactions.map(({ id, emoji, [language]: label }) => <li key={id}>
          <span aria-hidden="true">{emoji}</span><span className="visually-hidden">{label} </span>{data.counts[id]}
        </li>)}
      </ul>}
      {actions}
    </div>
    {signIn && data && <Link className="text-link" to="/login">{copy.login}</Link>}
    {verifyEmail && data && <p>{copy.verify}</p>}
    {loading && <p role="status">{copy.loading}</p>}
    {result && <p className="visually-hidden" role="status">{copy[result]}</p>}
    {failed && <div>
      <p role="alert">{copy.error}</p>
      <button className="button button-secondary" type="button" onClick={() => {
        setData(null);
        setFailed(false);
        setLoading(true);
        setResult(null);
        setReload(current => current + 1);
      }}>{copy.retry}</button>
    </div>}
  </section>;
}

import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../lib/auth';
import { COMMENT_LIMIT, MODERATION_REASON_LIMIT, type NewsComment, type NewsCommentAction, type NewsCommentPage } from '../lib/news-comments';
import type { NewsLanguage } from '../lib/news-language';
import { newsRequest } from '../lib/news';
import SwitchInput from './SwitchInput';
import './NewsComments.css';

const translations = {
  en: { heading: 'Comments', signIn: 'Log in to read comments', verify: 'Verify your email to read comments.',
    loading: 'Loading comments…', unavailable: 'Comments are unavailable.', failed: 'The change could not be confirmed. Refresh the thread before trying again.',
    refresh: 'Refresh comments', closed: 'Comments are closed.', empty: 'No comments yet.', post: 'Post comment', message: 'Your comment',
    toggle: 'Allow comments', older: 'Load older comments', missing: 'User no longer available', member: 'Member', edited: 'Edited',
    deleted: 'Comment removed', removed: 'Removed by moderator', note: 'Moderator note', edit: 'Edit', delete: 'Delete',
    redact: 'Redact passage', remove: 'Remove comment', restore: 'Restore comment', reason: 'Moderation reason',
    select: 'Select the text to redact', selected: 'Selected passage', redacted: 'Passage redacted',
    section: 'Text section', save: 'Save', cancel: 'Cancel',
    confirm: 'Delete this comment?', required: 'Select a passage before saving.', saved: 'Discussion updated.' },
  nl: { heading: 'Opmerkingen', signIn: 'Log in om opmerkingen te lezen', verify: 'Verifieer je e-mailadres om opmerkingen te lezen.',
    loading: 'Opmerkingen laden…', unavailable: 'Opmerkingen zijn niet beschikbaar.', failed: 'De wijziging kon niet worden bevestigd. Vernieuw de discussie en probeer het opnieuw.',
    refresh: 'Opmerkingen vernieuwen', closed: 'De discussie is gesloten.', empty: 'Nog geen opmerkingen.', post: 'Plaats opmerking', message: 'Je opmerking',
    toggle: 'Opmerkingen toestaan', older: 'Oudere opmerkingen laden', missing: 'Gebruiker niet meer beschikbaar', member: 'Lid', edited: 'Bewerkt',
    deleted: 'Opmerking verwijderd', removed: 'Verwijderd door moderator', note: 'Moderatornotitie', edit: 'Bewerken', delete: 'Verwijderen',
    redact: 'Passage verwijderen', remove: 'Opmerking verwijderen', restore: 'Opmerking herstellen', reason: 'Reden voor moderatie',
    select: 'Selecteer de tekst die je wilt verwijderen', selected: 'Geselecteerde passage', redacted: 'Passage verwijderd',
    section: 'Tekstgedeelte', save: 'Opslaan', cancel: 'Annuleren',
    confirm: 'Deze opmerking verwijderen?', required: 'Selecteer eerst een passage.', saved: 'Discussie bijgewerkt.' },
};
type Labels = typeof translations.en;
type CommentForm = 'edit' | 'delete' | 'redact' | 'remove';

export default function NewsComments({ articleId, language }: { articleId: string; language: NewsLanguage }) {
  const auth = useAuth();
  const copy = translations[language];
  if (auth.status === 'loading') return null;
  if (auth.status === 'error') return <p className="news-comments" lang={language}>{copy.unavailable}</p>;
  if (!auth.session) return <div className="news-comments" lang={language}><Link className="text-link" to="/login">{copy.signIn}</Link></div>;
  if (!auth.session.emailVerified) return <p className="news-comments" lang={language}>{copy.verify}</p>;
  return <Thread key={`${articleId}:${auth.session.account.userId}:${auth.session.csrfToken}`}
    articleId={articleId} proof={auth.session.csrfToken} language={language} />;
}

function Thread({ articleId, proof, language }: { articleId: string; proof: string; language: NewsLanguage }) {
  const copy = translations[language];
  const heading = useId();
  const endpoint = `/api/news-comments/${encodeURIComponent(articleId)}`;
  const [page, setPage] = useState<NewsCommentPage | null>(null);
  const [text, setText] = useState('');
  const [form, setForm] = useState<{ id: string; action: CommentForm } | null>(null);
  const [pending, setPending] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const operation = useRef<{ text: string; id: string } | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    void newsRequest<NewsCommentPage>(endpoint, proof, undefined, signal).then(result => {
      if (!controller.signal.aborted) setPage(result);
    }).catch(() => {
      if (!controller.signal.aborted) setError(copy.unavailable);
    }).finally(() => {
      if (!controller.signal.aborted) { request.current = null; setPending(false); }
    });
    return () => request.current?.abort();
  }, [endpoint, proof, copy.unavailable]);

  async function load(action?: NewsCommentAction, cursor?: string) {
    if (request.current) return false;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setMessage('');
    setError('');
    try {
      const path = cursor ? endpoint + '?before=' + encodeURIComponent(cursor) : endpoint;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      const result = await newsRequest<NewsCommentPage>(path, proof, action, signal);
      if (controller.signal.aborted) return false;
      setPage(current => cursor && current ? { ...result, comments: [...current.comments, ...result.comments] } : result);
      if (action) { setForm(null); setMessage(copy.saved); }
      return true;
    } catch {
      if (!controller.signal.aborted) setError(action ? copy.failed : copy.unavailable);
      return false;
    } finally {
      if (!controller.signal.aborted) { request.current = null; setPending(false); }
    }
  }

  async function post() {
    if (operation.current?.text !== text) operation.current = { text, id: crypto.randomUUID() };
    if (await load({ action: 'post', id: operation.current.id, text })) {
      operation.current = null;
      setText('');
    }
  }

  return <section className="news-comments" lang={language} aria-labelledby={heading} aria-busy={pending}>
    <div className="news-comments-heading">
      <h2 id={heading}>{copy.heading}</h2>
      {page?.canManageThread && <label className="news-comments-switch">
        <SwitchInput checked={page.open} disabled={pending || !!error}
          onChange={event => void load({ action: 'thread', open: event.target.checked, revision: page.revision })} />{copy.toggle}
      </label>}
    </div>
    {pending && !page && <p role="status">{copy.loading}</p>}
    {error && <div><p role="alert">{error}</p><button type="button" className="button button-secondary" disabled={pending}
      onClick={() => { setForm(null); void load(); }}>{copy.refresh}</button></div>}
    <p className="visually-hidden" role="status">{message}</p>
    {page && <>
      {!page.open && <p>{copy.closed}</p>}
      {page.open && <form onSubmit={event => { event.preventDefault(); if (text.trim() && !error) void post(); }}>
        <label className="news-comment-field">{copy.message}
          <textarea value={text} maxLength={COMMENT_LIMIT} rows={3} disabled={pending || !!error} onChange={event => setText(event.target.value)} />
        </label>
        <button type="submit" className="button" disabled={pending || !!error || !text.trim()}>{copy.post}</button>
      </form>}
      {!page.comments.length && page.open && <p>{copy.empty}</p>}
      <ul className="news-comment-list">
        {page.comments.map(comment => {
          const visible = comment.state === 'visible';
          const reference = { id: comment.id, revision: comment.revision };
          return <li className="news-comment" key={comment.id}>
            <div className="news-comment-meta">
              {visible && <strong>{comment.author === null ? copy.missing : comment.author || copy.member}</strong>}
              <time dateTime={new Date(comment.createdAt * 1000).toISOString()}>
                {new Date(comment.createdAt * 1000).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { timeZone: 'Europe/Amsterdam' })}
              </time>
              {visible && comment.edited && <span>{copy.edited}</span>}
            </div>
            {visible ? <>
              <p className="news-comment-text" dir="auto">{comment.parts.map((part, index) => 'text' in part ?
                <span key={index}>{part.text}</span> : <span key={index} className="news-comment-redaction">
                  <span aria-hidden="true">[…]</span><span className="visually-hidden">{copy.redacted}</span>
                </span>)}</p>
              {comment.parts.map((part, index) => 'note' in part && <p key={index} className="news-moderator-note" dir="auto">
                <strong>{copy.note}</strong> {part.note}
              </p>)}
            </> :
              <p>{comment.state === 'deleted' ? copy.deleted : copy.removed}{comment.reason && <> · {comment.reason}</>}</p>}
            {form?.id === comment.id ? <ActionForm key={form.action} action={form.action} comment={comment} copy={copy}
              blocked={pending || !!error} onCancel={() => setForm(null)} onSubmit={value => void load(value)} /> :
              <div className="news-comment-actions">
                {visible && comment.own && page.open && <>
                  <button type="button" className="button button-secondary" disabled={pending || !!error} onClick={() => setForm({ id: comment.id, action: 'edit' })}>{copy.edit}</button>
                  <button type="button" className="button button-secondary" disabled={pending || !!error} onClick={() => setForm({ id: comment.id, action: 'delete' })}>{copy.delete}</button>
                </>}
                {visible && page.moderator && <>
                  {comment.parts.some(part => 'text' in part && part.text.trim()) && <button type="button" className="button button-secondary" disabled={pending || !!error} onClick={() => setForm({ id: comment.id, action: 'redact' })}>{copy.redact}</button>}
                  <button type="button" className="button button-secondary" disabled={pending || !!error} onClick={() => setForm({ id: comment.id, action: 'remove' })}>{copy.remove}</button>
                </>}
                {comment.recoverable && <button type="button" className="button button-secondary" disabled={pending || !!error} onClick={() => void load({ ...reference, action: 'restore' })}>{copy.restore}</button>}
              </div>}
          </li>;
        })}
      </ul>
      {page.next && <button type="button" className="button button-secondary" disabled={pending || !!error || !!form}
        onClick={() => void load(undefined, page.next!)}>{copy.older}</button>}
    </>}
  </section>;
}

function ActionForm({ action, comment, copy, blocked, onCancel, onSubmit }: {
  action: CommentForm; comment: NewsComment; copy: Labels; blocked: boolean;
  onCancel: () => void; onSubmit: (value: NewsCommentAction) => void;
}) {
  const [parts, setParts] = useState(comment.parts);
  const [reason, setReason] = useState('');
  const textSections = comment.parts.flatMap((part, index) => 'text' in part && part.text.trim() ? [{ index, text: part.text }] : []);
  const [section, setSection] = useState(textSections[0]?.index ?? 0);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const part = comment.parts[section];
  const sectionText = part && 'text' in part ? part.text : '';
  const selectedText = sectionText.slice(selection.start, selection.end);
  const editing = action === 'edit', moderation = action === 'remove' || action === 'redact';
  const reference = { id: comment.id, revision: comment.revision };
  return <form className="news-comment-editor" onSubmit={event => {
    event.preventDefault();
    if (blocked) return;
    if (action === 'edit') onSubmit({ ...reference, action, parts: parts.flatMap(item => 'text' in item ? [item.text] : []) });
    else if (action === 'delete') onSubmit({ ...reference, action });
    else if (action === 'remove' && reason.trim()) onSubmit({ ...reference, action, reason });
    else if (action === 'redact' && reason.trim() && selectedText.trim()) onSubmit({ ...reference, action, reason, part: section, ...selection });
  }}>
    {action === 'delete' && <p>{copy.confirm}</p>}
    {editing && parts.map((item, index) => 'text' in item ? <label className="news-comment-field" key={index}>
      {copy.section} {index + 1}<textarea rows={2} maxLength={COMMENT_LIMIT} value={item.text} disabled={blocked}
        onChange={event => setParts(current => current.map((value, position) => position === index ? { text: event.target.value } : value))} />
    </label> : <p className="news-moderator-note" key={index}><strong>{copy.note}</strong> {item.note}</p>)}
    {action === 'redact' && <>
      {textSections.length > 1 && <label className="news-comment-field">{copy.section}<select value={section} disabled={blocked}
        onChange={event => { setSection(Number(event.target.value)); setSelection({ start: 0, end: 0 }); }}>
        {textSections.map(({ index }, order) => <option key={index} value={index}>{order + 1}</option>)}
      </select></label>}
      <label className="news-comment-field">{copy.select}<textarea key={section} rows={3} readOnly value={sectionText} disabled={blocked} dir="auto"
        onSelect={event => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} /></label>
      <div className="news-redaction-preview">
        <strong>{copy.selected}</strong>
        {selectedText.trim() ? <p className="news-comment-text" dir="auto">{sectionText.slice(0, selection.start)}<mark>{selectedText}</mark>{sectionText.slice(selection.end)}</p> :
          <p>{copy.required}</p>}
      </div>
    </>}
    {moderation && <label className="news-comment-field">{copy.reason}<input required maxLength={MODERATION_REASON_LIMIT} disabled={blocked}
      value={reason} onChange={event => setReason(event.target.value)} /></label>}
    <div className="news-comment-actions">
      <button className="button button-secondary" type="button" onClick={onCancel}>{copy.cancel}</button>
      <button className="button" type="submit" disabled={blocked || (moderation && !reason.trim()) || (action === 'redact' && !selectedText.trim())}>
        {action === 'delete' ? copy.delete : copy.save}
      </button>
    </div>
  </form>;
}

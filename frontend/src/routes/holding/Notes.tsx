import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { toast } from '../../components/Toast';
import { ratingColor } from '../federation/ratings';
import { num, pm, shortClub, fmtDay, NOTE_KIND, LINE_TITLE, useCanNote, type NoteKind, type NoteWithNow, type LeaguePlayer } from './api';
import { SectionTitle } from './parts';

/**
 * Заметки и решения руководства: пометка по игроку («в молодёжку с января», «наблюдаем»),
 * дата напоминания и срез рейтинга на момент решения — чтобы видеть, как игрок изменился
 * после решения. Только у руководства холдинга.
 */
const NOTES_KEY = ['holding', 'notes'];
export function useNotes(playerId?: number) {
  const can = useCanNote();
  return useQuery({
    queryKey: [...NOTES_KEY, playerId ?? 'all'],
    queryFn: () => api<{ notes: NoteWithNow[] }>(`/holding/notes${playerId ? `?player=${playerId}` : ''}`),
    enabled: can,
    staleTime: 60_000,
  });
}

function useNoteMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: NOTES_KEY });
  const create = useMutation({
    mutationFn: (b: { playerId: number; kind: NoteKind; text: string; remindOn: string | null }) => api('/holding/notes', { method: 'POST', body: b }),
    onSuccess: () => { done(); toast.success('Решение записано'); },
    onError: () => toast.error('Не удалось записать'),
  });
  const patch = useMutation({
    mutationFn: ({ id, ...b }: { id: number; closed?: boolean; remindOn?: string | null }) => api(`/holding/notes/${id}`, { method: 'PATCH', body: b }),
    onSuccess: done,
    onError: () => toast.error('Не удалось сохранить'),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/holding/notes/${id}`, { method: 'DELETE', body: {} }),
    onSuccess: () => { done(); toast.info('Заметка удалена'); },
    onError: () => toast.error('Не удалось удалить'),
  });
  return { create, patch, remove };
}

/** Как изменился игрок после решения: рейтинг и место в регионе тогда и сейчас. */
function SinceDecision({ n }: { n: NoteWithNow }) {
  if (n.ratingAt == null && n.rankAt == null) return null;
  const now = n.now;
  const dr = now?.rating != null && n.ratingAt != null ? now.rating - n.ratingAt : null;
  const dk = now?.rankRegion != null && n.rankAt != null ? n.rankAt - now.rankRegion : null;
  return (
    <span className="hc-note__since">
      тогда {n.ratingAt != null ? num(n.ratingAt) : '—'}{n.rankAt != null ? ` · ${n.rankAt}-й из ${n.sizeAt}` : ''}
      {' → '}сейчас <b style={{ color: ratingColor(now?.rating ?? null) }}>{now?.rating != null ? num(now.rating) : '—'}</b>{now?.rankRegion != null ? ` · ${now.rankRegion}-й из ${now.sizeRegion}` : ''}
      {dr != null && dr !== 0 && <span className={dr > 0 ? 'hc-delta--up' : 'hc-delta--down'}> ({pm(dr)}{dk ? `, ${dk > 0 ? '↑' : '↓'}${Math.abs(dk)} мест` : ''})</span>}
    </span>
  );
}

function NoteItem({ n, showPlayer }: { n: NoteWithNow; showPlayer?: boolean }) {
  const { patch, remove } = useNoteMutations();
  return (
    <div className={`hc-note${n.closedAt ? ' hc-note--closed' : ''}${n.due ? ' hc-note--due' : ''}`}>
      <div className="hc-note__head">
        <span className={`hc-note__kind hc-note__kind--${n.kind}`}>{NOTE_KIND[n.kind]}</span>
        {showPlayer && <Link to={`/holding/players/${n.playerId}`} className="hc-note__player">{n.playerName}</Link>}
        {showPlayer && n.now && <span className="hc-muted hc-small">{shortClub(n.now.clubLabel)} {n.now.birthYear}{n.now.line ? ` · ${LINE_TITLE[n.now.line].toLowerCase()}` : ''}</span>}
        <span className="hc-muted hc-small" style={{ marginLeft: 'auto' }}>{fmtDay(n.createdAt)}{n.authorName ? ` · ${n.authorName}` : ''}</span>
      </div>
      {n.text && <div className="hc-note__text">{n.text}</div>}
      <div className="hc-note__foot">
        <SinceDecision n={n} />
        {n.remindOn && !n.closedAt && <span className={`hc-note__remind${n.due ? ' hc-note__remind--due' : ''}`}>{n.due ? 'пора вернуться · ' : 'напомнить '}{fmtDay(n.remindOn)}</span>}
        {n.closedAt && <span className="hc-muted hc-small">закрыто {fmtDay(n.closedAt)}</span>}
        <span className="hc-note__actions hc-noprint">
          <button type="button" className="fed-link" onClick={() => patch.mutate({ id: n.id, closed: !n.closedAt })}>{n.closedAt ? 'вернуть в работу' : 'исполнено'}</button>
          {n.due && <button type="button" className="fed-link" onClick={() => patch.mutate({ id: n.id, remindOn: plusDays(14) })}>отложить на 2 недели</button>}
          <button type="button" className="fed-link hc-note__del" onClick={() => { if (window.confirm('Удалить заметку?')) remove.mutate(n.id); }}>удалить</button>
        </span>
      </div>
    </div>
  );
}

const plusDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const REMIND = [{ v: '', t: 'без напоминания' }, { v: '14', t: 'через 2 недели' }, { v: '30', t: 'через месяц' }, { v: '90', t: 'через 3 месяца' }, { v: 'date', t: 'в дату…' }];

/** Форма решения по игроку. Готовые варианты — то, что руководство решает чаще всего. */
function NoteForm({ playerId, suggested }: { playerId: number; suggested?: NoteKind }) {
  const { create } = useNoteMutations();
  const [kind, setKind] = useState<NoteKind>(suggested ?? 'watch');
  const [text, setText] = useState('');
  const [remind, setRemind] = useState('30');
  const [date, setDate] = useState(plusDays(30));
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === 'other' && !text.trim()) { toast.error('Напишите заметку'); return; }
    const remindOn = remind === '' ? null : remind === 'date' ? date : plusDays(Number(remind));
    create.mutate({ playerId, kind, text: text.trim(), remindOn }, { onSuccess: () => setText('') });
  }
  return (
    <form className="hc-note-form hc-noprint" onSubmit={submit}>
      <div className="hc-note-form__kinds" role="radiogroup" aria-label="Решение">
        {(Object.keys(NOTE_KIND) as NoteKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={`hc-chip${kind === k ? ' hc-chip--on' : ''}`} onClick={() => setKind(k)}>{NOTE_KIND[k]}</button>
        ))}
      </div>
      <textarea className="fed-input hc-note-form__text" rows={2} placeholder={kind === 'youth' ? 'Например: в молодёжку с января, после зимних сборов' : 'Комментарий (необязательно)'} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
      <div className="hc-note-form__row">
        <label className="hc-muted hc-small">Напомнить
          <select className="fed-select" value={remind} onChange={(e) => setRemind(e.target.value)} style={{ marginLeft: 8 }}>{REMIND.map((r) => <option key={r.v} value={r.v}>{r.t}</option>)}</select>
        </label>
        {remind === 'date' && <input type="date" className="fed-input" value={date} min={plusDays(1)} onChange={(e) => setDate(e.target.value)} />}
        <button type="submit" className="hc-btn hc-btn--primary" disabled={create.isPending}>{create.isPending ? 'Записываю…' : 'Записать решение'}</button>
      </div>
    </form>
  );
}

/** Блок «Решения по игроку» на странице игрока и в карточке. */
export function PlayerNotes({ player, suggested, title = 'Решения руководства' }: { player: Pick<LeaguePlayer, 'id' | 'name'>; suggested?: NoteKind; title?: string }) {
  const can = useCanNote();
  const notes = useNotes(player.id);
  if (!can) return null;
  const list = notes.data?.notes ?? [];
  return (
    <>
      <SectionTitle sub="Пометка фиксирует рейтинг и место игрока на момент решения — потом видно, как он изменился. Напоминание всплывёт на обзоре.">{title}</SectionTitle>
      <section className="fed-card hc-notes">
        <NoteForm playerId={player.id} suggested={suggested} />
        {list.length > 0 && <div className="hc-notes__list">{list.map((n) => <NoteItem key={n.id} n={n} />)}</div>}
      </section>
    </>
  );
}

/** Обзор: напоминания, у которых подошла дата, и решения в работе. */
export function NotesDigest({ q }: { q: string }) {
  const can = useCanNote();
  const notes = useNotes();
  if (!can) return null;
  const list = notes.data?.notes ?? [];
  const due = list.filter((n) => n.due);
  const open = list.filter((n) => !n.closedAt && !n.due).slice(0, 4);
  return (
    <>
      <SectionTitle sub={<>Решения руководства по игрокам и напоминания. Полный список — в <Link to={`/holding/journal${q}`} className="fed-link">журнале решений</Link>.</>}>Напоминания и решения в работе</SectionTitle>
      {notes.isLoading ? <div className="fed-skeleton" style={{ height: 80 }} /> : list.length === 0 ? (
        <div className="fed-note">Решений пока нет. Откройте игрока или карточку кандидата и запишите решение — кабинет напомнит о нём в нужную дату.</div>
      ) : (
        <section className="fed-card hc-notes">
          {due.length > 0 && <div className="hc-notes__due-title">Пора вернуться — {due.length}</div>}
          {[...due, ...open].map((n) => <NoteItem key={n.id} n={n} showPlayer />)}
          {due.length === 0 && open.length === 0 && <div className="fed-note">Все решения исполнены.</div>}
        </section>
      )}
    </>
  );
}

/** Журнал решений: все пометки, фильтр по статусу. */
export function HoldingJournal() {
  const can = useCanNote();
  const notes = useNotes();
  const [filter, setFilter] = useState<'open' | 'due' | 'closed' | 'all'>('open');
  if (!can) return <div className="fed-empty">Журнал решений доступен руководству холдинга.</div>;
  const list = (notes.data?.notes ?? []).filter((n) => filter === 'all' || (filter === 'open' ? !n.closedAt : filter === 'due' ? n.due : !!n.closedAt));
  const all = notes.data?.notes ?? [];
  return (
    <div>
      <div className="fed-hero" style={{ marginBottom: 16 }}>
        <h1 className="fed-hero__title" style={{ fontSize: 30 }}>Журнал решений</h1>
        <p className="fed-hero__sub" style={{ fontSize: 14 }}>Все решения руководства по игрокам: что решили, когда вернуться и как игрок изменился после решения.</p>
      </div>
      <div className="hc-basebar">
        {([['open', `в работе · ${all.filter((n) => !n.closedAt).length}`], ['due', `пора вернуться · ${all.filter((n) => n.due).length}`], ['closed', `исполнено · ${all.filter((n) => n.closedAt).length}`], ['all', `все · ${all.length}`]] as const).map(([k, t]) => (
          <button key={k} type="button" className={`hc-chip${filter === k ? ' hc-chip--on' : ''}`} onClick={() => setFilter(k)}>{t}</button>
        ))}
      </div>
      <section className="fed-card hc-notes" style={{ marginTop: 14 }}>
        {notes.isLoading ? <div className="fed-skeleton" style={{ height: 200 }} /> : list.length === 0 ? <div className="fed-note">Здесь пусто.</div> : list.map((n) => <NoteItem key={n.id} n={n} showPlayer />)}
      </section>
    </div>
  );
}

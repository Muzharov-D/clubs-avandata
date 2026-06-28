import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import './federation.css';
import './secondLeague.css';

// Вторая лига (детско-юношеская, ФФСПб): календарь · таблица · клубный зачёт · видео.

const AGE_BY_YEAR: Record<number, string> = { 2013: 'До 14', 2012: 'До 15', 2011: 'До 16', 2010: 'До 17' };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${d.toTimeString().slice(0, 5)}`;
}

interface SlMatch {
  id: number; date: string | null; tour: number | null;
  home: string; away: string; homeLogo: string | null; awayLogo: string | null;
  score: string | null; scoreHome: number | null; scoreAway: number | null;
  played: boolean; techDefeat: boolean; venue: string | null; videoSlug?: string | null;
}
interface SlStandRow {
  position: number | null; teamId: number | null; team: string; logo: string | null;
  games: number; wins: number; draws: number; losses: number; scored: number; missed: number; diff: number; points: number;
}
interface SlAgeData { age: string; year: number; total: number; matches: SlMatch[]; table: SlStandRow[] }
interface SlClubRow {
  rank: number; name: string; logo: string | null; posSum: number; participated: number;
  points: number; diff: number; breakdown: Record<number, { pos: number | null; total: number }>;
}

type ViewMode = 'calendar' | 'table' | 'club';

export function SecondLeague() {
  const yearsQ = useQuery({ queryKey: ['sl', 'years'], queryFn: () => api<{ years: number[] }>('/federation/av/second-league/years') });
  const years = yearsQ.data?.years ?? [2013, 2012, 2011, 2010];
  const [year, setYear] = useState<number>(2013);
  const [view, setView] = useState<ViewMode>('calendar');
  const [video, setVideo] = useState<{ slug: string; title: string } | null>(null);

  const ageQ = useQuery({
    queryKey: ['sl', 'age', year],
    queryFn: () => api<SlAgeData>(`/federation/av/second-league/age?year=${year}`),
    enabled: view !== 'club',
  });
  const clubQ = useQuery({
    queryKey: ['sl', 'club-ranking'],
    queryFn: () => api<{ years: number[]; ranking: SlClubRow[] }>('/federation/av/second-league/club-ranking'),
    enabled: view === 'club',
  });

  return (
    <div>
      <div className="fed-hero">
        <span className="fed-hero__kicker">Вторая лига · ФФСПб</span>
        <h1 className="fed-hero__title">Календарь и результаты</h1>
        <p className="fed-hero__sub">Турнирная таблица, клубный зачёт и видео матчей · сезон 2026</p>
      </div>

      <div className="sl-tabs" role="tablist" aria-label="Раздел">
        {([['calendar', 'Календарь'], ['table', 'Таблица'], ['club', 'Клубный зачёт']] as Array<[ViewMode, string]>).map(([v, label]) => (
          <button key={v} type="button" aria-pressed={view === v} className={`fed-tab${view === v ? ' fed-tab--active' : ''}`} onClick={() => setView(v)}>{label}</button>
        ))}
      </div>

      {view !== 'club' && (
        <div className="fed-filter__group" role="tablist" aria-label="Возраст" style={{ marginBottom: 14 }}>
          <span className="fed-filter__label">Возраст</span>
          {years.map((y) => (
            <button key={y} type="button" aria-pressed={year === y} className={`fed-pill${year === y ? ' fed-pill--active' : ''}`} onClick={() => setYear(y)}>{AGE_BY_YEAR[y] ?? `${y} г.р.`}</button>
          ))}
        </div>
      )}

      {view === 'calendar' && <CalendarView data={ageQ.data} loading={ageQ.isLoading} onVideo={setVideo} />}
      {view === 'table' && <TableView data={ageQ.data} loading={ageQ.isLoading} />}
      {view === 'club' && <ClubRankingView data={clubQ.data} loading={clubQ.isLoading} />}

      {video && <VideoModal slug={video.slug} title={video.title} onClose={() => setVideo(null)} />}
    </div>
  );
}

function CalendarView({ data, loading, onVideo }: { data?: SlAgeData; loading: boolean; onVideo: (v: { slug: string; title: string }) => void }) {
  if (loading) return <div className="fed-skeleton" style={{ height: 280 }} />;
  if (!data || !data.matches.length) return <div className="fed-note fed-note--empty">Матчей по выбранному возрасту нет.</div>;
  const byTour = new Map<number | 'none', SlMatch[]>();
  for (const m of data.matches) { const k = m.tour ?? 'none'; if (!byTour.has(k)) byTour.set(k, []); byTour.get(k)!.push(m); }
  const tours = [...byTour.keys()].sort((a, b) => (a === 'none' ? 1e9 : a) - (b === 'none' ? 1e9 : b));
  return (
    <>
      {tours.map((tk) => (
        <div key={String(tk)}>
          <div className="fed-divider"><h2 className="fed-divider__title">{tk === 'none' ? 'Без тура' : `Тур ${tk}`}</h2><div className="fed-divider__line" /></div>
          <div className="sl-grid">
            {byTour.get(tk)!.map((m) => {
              const hWin = m.played && (m.scoreHome ?? 0) > (m.scoreAway ?? 0);
              const aWin = m.played && (m.scoreAway ?? 0) > (m.scoreHome ?? 0);
              return (
                <div key={m.id} className="sl-match">
                  <div className="sl-match__row">
                    <div className={`sl-team sl-team--h${m.played && !hWin ? ' sl-team--dim' : ''}`}><span className="sl-team__nm">{m.home}</span><ClubShield logoUrl={m.homeLogo} name={m.home} /></div>
                    <div className="sl-score">{m.played ? <span className="sl-score__v">{m.scoreHome} : {m.scoreAway}</span> : (m.date ? <span className="sl-score__time">{new Date(m.date).toTimeString().slice(0, 5)}</span> : <span className="sl-score__vs">—</span>)}</div>
                    <div className={`sl-team${m.played && !aWin ? ' sl-team--dim' : ''}`}><ClubShield logoUrl={m.awayLogo} name={m.away} /><span className="sl-team__nm">{m.away}</span></div>
                  </div>
                  <div className="sl-match__meta">
                    <span className={`fed-badge${m.techDefeat ? ' fed-badge--danger' : m.played ? ' fed-badge--success' : ''}`}>{m.techDefeat ? 'тех. поражение' : m.played ? 'сыгран' : 'предстоит'}</span>
                    <span className="sl-dot" />{fmtDate(m.date) || 'дата уточняется'}
                    {m.venue && <><span className="sl-dot" />{m.venue}</>}
                    {m.videoSlug && <button type="button" className="sl-vbtn" onClick={() => onVideo({ slug: m.videoSlug!, title: `${m.home} — ${m.away}` })}>▶ Видео</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function TableView({ data, loading }: { data?: SlAgeData; loading: boolean }) {
  if (loading) return <div className="fed-skeleton" style={{ height: 280 }} />;
  if (!data || !data.table.length) return <div className="fed-note fed-note--empty">Таблица недоступна.</div>;
  return (
    <section className="fed-card">
      <table className="fed-table">
        <thead><tr><th style={{ width: 40 }} /><th>Команда</th><th className="fed-table__num">И</th><th className="fed-table__num">В</th><th className="fed-table__num">Н</th><th className="fed-table__num">П</th><th className="fed-table__num">Мячи</th><th className="fed-table__num">±</th><th className="fed-table__num">ОЧ</th></tr></thead>
        <tbody>
          {data.table.map((r) => (
            <tr key={r.teamId ?? r.team}>
              <td className="fed-table__num" style={{ color: (r.position ?? 99) <= 1 ? 'var(--accent)' : 'var(--text-secondary)' }}>{r.position}</td>
              <td><span className="sl-cell-team"><ClubShield logoUrl={r.logo} name={r.team} /><span>{r.team}</span></span></td>
              <td className="fed-table__num">{r.games}</td><td className="fed-table__num">{r.wins}</td><td className="fed-table__num">{r.draws}</td><td className="fed-table__num">{r.losses}</td>
              <td className="fed-table__num">{r.scored}–{r.missed}</td><td className="fed-table__num">{r.diff > 0 ? '+' : ''}{r.diff}</td>
              <td className="fed-table__num" style={{ color: 'var(--accent)', fontWeight: 700 }}>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ClubRankingView({ data, loading }: { data?: { years: number[]; ranking: SlClubRow[] }; loading: boolean }) {
  if (loading) return <div className="fed-skeleton" style={{ height: 280 }} />;
  if (!data || !data.ranking.length) return <div className="fed-note fed-note--empty">Зачёт недоступен.</div>;
  return (
    <section className="fed-card">
      <table className="fed-table">
        <thead><tr><th style={{ width: 40 }} /><th>Клуб</th>{data.years.map((y) => <th key={y} className="fed-table__num">{AGE_BY_YEAR[y] ?? y}</th>)}<th className="fed-table__num">Σмест</th><th className="fed-table__num">ОЧ</th><th className="fed-table__num">±</th></tr></thead>
        <tbody>
          {data.ranking.map((c) => {
            const best = Math.min(...data.years.map((y) => c.breakdown[y]?.pos ?? 99));
            return (
              <tr key={c.name}>
                <td className="fed-table__num" style={{ color: c.rank <= 1 ? 'var(--accent)' : 'var(--text-secondary)' }}>{c.rank}</td>
                <td><span className="sl-cell-team"><ClubShield logoUrl={c.logo} name={c.name} /><span>{c.name}</span></span></td>
                {data.years.map((y) => { const p = c.breakdown[y]?.pos; return <td key={y} className="fed-table__num" style={{ color: p === best ? 'var(--accent)' : 'var(--text-tertiary)' }}>{p ?? '—'}</td>; })}
                <td className="fed-table__num" style={{ color: 'var(--accent)', fontWeight: 700 }}>{c.posSum}</td>
                <td className="fed-table__num">{c.points}</td><td className="fed-table__num">{c.diff > 0 ? '+' : ''}{c.diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="fed-note" style={{ marginTop: 12 }}>«Сумма мест»: для каждого возраста берём место клуба, суммируем по всем четырём. Меньше сумма — выше клуб.</p>
    </section>
  );
}

function VideoModal({ slug, title, onClose }: { slug: string; title: string; onClose: () => void }) {
  const vq = useQuery({ queryKey: ['sl', 'video', slug], queryFn: () => api<{ status: string | null; parts: string[] }>(`/federation/av/second-league/match-video?slug=${encodeURIComponent(slug)}`) });
  const [part, setPart] = useState(0);
  const parts = vq.data?.parts ?? [];
  return (
    <div className="sl-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sl-modal__box">
        <div className="sl-modal__head"><span className="sl-modal__t">{title}</span><button type="button" className="sl-modal__x" onClick={onClose} aria-label="Закрыть">✕</button></div>
        <div className="sl-modal__frame">
          {vq.isLoading ? <div className="sl-modal__msg">Загрузка видео…</div>
            : parts.length ? <video key={part} controls autoPlay playsInline src={parts[part]} className="sl-modal__video" />
              : <div className="sl-modal__msg">Видео ещё рендерится (статус {vq.data?.status ?? '?'}).</div>}
          {parts.length > 1 && (
            <div className="sl-parts">{parts.map((_, i) => <button key={i} type="button" className={`sl-part${i === part ? ' sl-part--on' : ''}`} onClick={() => setPart(i)}>{i + 1}-я половина</button>)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

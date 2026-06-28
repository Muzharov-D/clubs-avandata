import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import './secondLeague.css';

// Управление лигами — premium-раздел кабинета федерации (уровень EPL).
// Вторая лига (ФФСПб): таблица · календарь · клубный зачёт · видео.

const AGE_BY_YEAR: Record<number, string> = { 2013: 'До 14', 2012: 'До 15', 2011: 'До 16', 2010: 'До 17' };
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const clean = (s: string): string => (s || '').trim();
const hhmm = (iso: string | null): string => (iso ? new Date(iso).toTimeString().slice(0, 5) : '');
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hhmm(iso)}`;
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
interface SlAgeData { age: string; year: number; total: number; matches: SlMatch[]; table: SlStandRow[]; degraded?: boolean }
interface SlClubRow {
  rank: number; name: string; logo: string | null; posSum: number; participated: number;
  points: number; diff: number; breakdown: Record<number, { pos: number | null; total: number }>;
}

type ViewMode = 'table' | 'calendar' | 'club';
type Res = 'W' | 'D' | 'L';

/** Гид формы — 5 последних сыгранных матчей команды (В/Н/П), свежий справа. */
function formOf(matches: SlMatch[], team: string): Res[] {
  const t = clean(team);
  return matches
    .filter((m) => m.played && (clean(m.home) === t || clean(m.away) === t))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-5)
    .map((m) => {
      const gf = clean(m.home) === t ? (m.scoreHome ?? 0) : (m.scoreAway ?? 0);
      const ga = clean(m.home) === t ? (m.scoreAway ?? 0) : (m.scoreHome ?? 0);
      return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    });
}

export function SecondLeague() {
  const yearsQ = useQuery({ queryKey: ['sl', 'years'], queryFn: () => api<{ years: number[] }>('/federation/av/second-league/years') });
  const years = yearsQ.data?.years ?? [2013, 2012, 2011, 2010];
  const [year, setYear] = useState<number>(2013);
  const [view, setView] = useState<ViewMode>('table');
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

  const t = ageQ.data?.table ?? [];
  const stats = t.length
    ? [
        ['Команд', String(t.length)],
        ['Туров сыграно', String(Math.max(...t.map((r) => r.games)))],
        ['Матчей', String(ageQ.data!.matches.filter((m) => m.played).length)],
        ['Голов', String(t.reduce((a, r) => a + r.scored, 0))],
        ['Лидер', clean(t[0].team)],
      ]
    : [['Команд', '—'], ['Туров сыграно', '—'], ['Матчей', '—'], ['Голов', '—'], ['Лидер', '—']];

  return (
    <div className="sl-root">
      <div className="sl-kick">Кабинет федерации <span className="sl-d" /> <b>Управление лигами</b></div>

      <section className="sl-hero">
        <div className="sl-hero-row">
          <div className="sl-league">
            <div className="sl-league-badge">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.4 5 5.6.7-4 4 1 5.6L12 19.8 6.9 22.3l1-5.6-4-4 5.6-.7L12 2z" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            </div>
            <div>
              <h1 className="sl-disp">Вторая лига</h1>
              <div className="sl-league-sub">Первенство Санкт-Петербурга · ФФСПб <span className="sl-d" /> детско-юношеская</div>
            </div>
          </div>
          <span className="sl-season"><i /> Сезон 2025/26 · идёт</span>
        </div>
        <div className="sl-stats">
          {stats.map(([l, v]) => (
            <div className="sl-stat" key={l}><div className="v">{v}</div><div className="l">{l}</div></div>
          ))}
        </div>
      </section>

      <div className="sl-controls">
        <div className="sl-seg sl-ages" role="tablist" aria-label="Возраст">
          {years.map((y) => (
            <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)}>{AGE_BY_YEAR[y] ?? `${y} г.р.`}</button>
          ))}
        </div>
        <div className="sl-seg" role="tablist" aria-label="Раздел">
          {([['table', 'Таблица'], ['calendar', 'Календарь'], ['club', 'Клубный зачёт']] as Array<[ViewMode, string]>).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
          ))}
        </div>
      </div>

      {view === 'table' && <TableView data={ageQ.data} loading={ageQ.isLoading} />}
      {view === 'calendar' && <CalendarView data={ageQ.data} loading={ageQ.isLoading} onVideo={setVideo} />}
      {view === 'club' && <ClubRankingView data={clubQ.data} loading={clubQ.isLoading} />}

      {video && <VideoModal slug={video.slug} title={video.title} onClose={() => setVideo(null)} />}
    </div>
  );
}

function TableView({ data, loading }: { data?: SlAgeData; loading: boolean }) {
  if (loading) return <div className="sl-skel" />;
  if (data?.degraded) return <div className="sl-card"><div className="sl-empty">Данные ФФСПб временно недоступны. Обновите страницу через минуту.</div></div>;
  if (!data || !data.table.length) return <div className="sl-card"><div className="sl-empty">Таблица недоступна.</div></div>;
  const n = data.table.length;
  return (
    <div className="sl-card">
      <table className="sl-tbl">
        <thead><tr>
          <th className="l" style={{ width: 54 }}>#</th><th className="l">Клуб</th>
          <th>И</th><th>В</th><th>Н</th><th>П</th><th>Голы</th><th>±</th><th>Очки</th>
          <th className="r">Форма</th>
        </tr></thead>
        <tbody>
          {data.table.map((r) => {
            const pos = r.position ?? 99;
            const cls = [pos === 1 ? 'sl-champ' : '', pos <= 3 ? 'sl-zone-top' : '', pos >= n - 2 ? 'sl-zone-rel' : ''].join(' ').trim();
            const form = formOf(data.matches, r.team);
            return (
              <tr key={r.teamId ?? r.team} className={cls}>
                <td className="sl-pos"><span className="n">{r.position}</span></td>
                <td className="sl-club"><div className="row"><ClubShield logoUrl={r.logo} name={clean(r.team)} size={34} /><span className="sl-nm">{clean(r.team)}</span></div></td>
                <td className="sl-mut">{r.games}</td><td>{r.wins}</td><td>{r.draws}</td><td>{r.losses}</td>
                <td className="sl-gd">{r.scored}<b>:</b>{r.missed}</td>
                <td className={`sl-diff ${r.diff >= 0 ? 'pos' : 'neg'}`}>{r.diff > 0 ? '+' : ''}{r.diff}</td>
                <td className="sl-pts">{r.points}</td>
                <td className="r"><span className="sl-form">{form.map((f, i) => <span key={i} className={`sl-fp ${f}`}>{f === 'W' ? 'В' : f === 'D' ? 'Н' : 'П'}</span>)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="sl-legend">
        <span><i className="sl-lg-top" /> Лидеры дивизиона</span>
        <span><i className="sl-lg-rel" /> Зона вылета</span>
        <span style={{ color: 'var(--sl-mut2)' }}>Форма — 5 последних матчей, свежий справа</span>
      </div>
    </div>
  );
}

function CalendarView({ data, loading, onVideo }: { data?: SlAgeData; loading: boolean; onVideo: (v: { slug: string; title: string }) => void }) {
  if (loading) return <div className="sl-skel" />;
  if (data?.degraded) return <div className="sl-card"><div className="sl-empty">Данные ФФСПб временно недоступны. Обновите страницу через минуту.</div></div>;
  if (!data || !data.matches.length) return <div className="sl-card"><div className="sl-empty">Матчей по выбранному возрасту нет.</div></div>;
  const byTour = new Map<number | 'none', SlMatch[]>();
  for (const m of data.matches) { const k = m.tour ?? 'none'; if (!byTour.has(k)) byTour.set(k, []); byTour.get(k)!.push(m); }
  const tours = [...byTour.keys()].sort((a, b) => (a === 'none' ? 1e9 : a) - (b === 'none' ? 1e9 : b));
  return (
    <>
      {tours.map((tk) => {
        const ms = byTour.get(tk)!;
        const days = ms.map((m) => m.date ? new Date(m.date) : null).filter(Boolean) as Date[];
        const tag = days.length
          ? (() => { const dd = days.map((d) => d.getDate()); const lo = Math.min(...dd), hi = Math.max(...dd); return `${lo === hi ? lo : `${lo}–${hi}`} ${MONTHS[days[0].getMonth()]}`; })()
          : '';
        return (
          <div key={String(tk)}>
            <div className="sl-tour"><h3>{tk === 'none' ? 'Без тура' : `Тур ${tk}`}</h3>{tag && <span className="tag">{tag}</span>}<div className="ln" /></div>
            <div className="sl-fix-grid">
              {ms.map((m) => {
                const hWin = m.played && (m.scoreHome ?? 0) > (m.scoreAway ?? 0);
                const aWin = m.played && (m.scoreAway ?? 0) > (m.scoreHome ?? 0);
                return (
                  <div key={m.id} className="sl-fix">
                    <div className="sl-teams">
                      <div className={`sl-t h${m.played && !hWin ? ' dim' : ''}`}><span className="sl-nm">{clean(m.home)}</span><ClubShield logoUrl={m.homeLogo} name={clean(m.home)} size={30} /></div>
                      <div className={`sl-score${m.played ? '' : ' up'}`}>
                        {m.played
                          ? <><span>{m.scoreHome}</span><span className="vs">:</span><span>{m.scoreAway}</span></>
                          : <span className="vs">{hhmm(m.date) || '—'}</span>}
                      </div>
                      <div className={`sl-t${m.played && !aWin ? ' dim' : ''}`}><ClubShield logoUrl={m.awayLogo} name={clean(m.away)} size={30} /><span className="sl-nm">{clean(m.away)}</span></div>
                    </div>
                    <div className="sl-meta">
                      <span className={`sl-bdg ${m.techDefeat ? 'tech' : m.played ? 'ok' : 'up'}`}>{m.techDefeat ? 'тех. поражение' : m.played ? 'сыгран' : 'предстоит'}</span>
                      <span className="sep" />{fmtDate(m.date) || 'дата уточняется'}
                      {m.venue && <><span className="sep" />{m.venue}</>}
                      {m.videoSlug && <button type="button" className="sl-watch" onClick={() => onVideo({ slug: m.videoSlug!, title: `${clean(m.home)} — ${clean(m.away)}` })}>▶ Смотреть</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function ClubRankingView({ data, loading }: { data?: { years: number[]; ranking: SlClubRow[] }; loading: boolean }) {
  if (loading) return <div className="sl-skel" />;
  if (!data || !data.ranking.length) return <div className="sl-card"><div className="sl-empty">Зачёт недоступен.</div></div>;
  const ys = data.years;
  return (
    <div className="sl-card">
      <table className="sl-rk">
        <thead><tr>
          <th className="l" style={{ width: 54 }}>#</th><th className="l">Клуб</th>
          {ys.map((y) => <th key={y}>{AGE_BY_YEAR[y] ?? y}</th>)}
          <th>Σ мест</th><th>Очки</th><th>±</th>
        </tr></thead>
        <tbody>
          {data.ranking.map((c) => (
            <tr key={c.name} className={c.rank <= 3 ? `sl-m${c.rank}` : ''}>
              <td><span className="sl-medal">{c.rank}</span></td>
              <td className="sl-club"><div className="row"><ClubShield logoUrl={c.logo} name={clean(c.name)} size={34} /><span className="sl-nm">{clean(c.name)}</span></div></td>
              {ys.map((y) => { const p = c.breakdown[y]?.pos; return <td key={y} className="sl-agecell">{p ? <b>{p}</b> : '—'}</td>; })}
              <td className="sl-sigma">{c.posSum}</td>
              <td>{c.points}</td>
              <td className={`sl-diff ${c.diff >= 0 ? 'pos' : 'neg'}`}>{c.diff > 0 ? '+' : ''}{c.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sl-legend"><span style={{ color: 'var(--sl-mut2)' }}>Меньше сумма занятых мест по 4 возрастам — выше клуб в общем зачёте региона</span></div>
    </div>
  );
}

function VideoModal({ slug, title, onClose }: { slug: string; title: string; onClose: () => void }) {
  const vq = useQuery({ queryKey: ['sl', 'video', slug], queryFn: () => api<{ status: string | null; parts: string[] }>(`/federation/av/second-league/match-video?slug=${encodeURIComponent(slug)}`) });
  const [part, setPart] = useState(0);
  const parts = vq.data?.parts ?? [];
  return (
    <div className="sl-modal-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sl-modal-box">
        <div className="sl-modal-hd"><h3>{title}</h3><button type="button" className="sl-modal-x" onClick={onClose} aria-label="Закрыть">✕</button></div>
        <div className="sl-modal-body">
          {parts.length > 1 && (
            <div className="sl-halves">{parts.map((_, i) => <button key={i} type="button" aria-pressed={i === part} onClick={() => setPart(i)}>{i + 1}-я половина</button>)}</div>
          )}
          <div className="sl-vstage">
            {vq.isLoading ? 'Загрузка видео…'
              : parts.length ? <video key={part} controls autoPlay playsInline src={parts[part]} />
                : `Видео ещё рендерится (статус ${vq.data?.status ?? '?'}).`}
          </div>
        </div>
      </div>
    </div>
  );
}

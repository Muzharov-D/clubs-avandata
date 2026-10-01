import { Link, useNavigate } from 'react-router-dom';
import { FedError } from '../federation/FedState';
import { useHoldingProfile, useHoldingAnalytics, useHoldingChanges, useCanNote, num, pm, shortClub, fmtDay, LINE_TITLE, LIST_SHORT, NOTE_KIND, type TeamLeague, type LeaguePlayer, type HoldingAnalytics, type HoldingChanges } from './api';
import { useNotes } from './Notes';
import { HdLoading } from './HoldingShell';
import { useNavQuery, useScope, useScopeLabel, scopeAnalytics, scopeChanges, inScope } from './scope';

/**
 * Брифинг — первый экран руководства. Отвечает на три вопроса недели словами и цифрами:
 * где мы среди команд региона, кто готов подняться выше, кого упускает селекция.
 * Ниже — что изменилось, все команды против лиги, что требует внимания, напоминания.
 */
export function HoldingOverview() {
  const profile = useHoldingProfile();
  const an = useHoldingAnalytics();
  const q = useNavQuery();
  const scope = useScope();
  const label = useScopeLabel();
  if (profile.error || an.error) return <FedError subject="Брифинг" />;
  if (!profile.data || !an.data) return <HdLoading />;
  const p = profile.data, a = scopeAnalytics(an.data, scope);
  const live = p.teams.every((t) => t.standingsSource === 'ffspb-live');
  const teams = a.teams.slice().sort((x, y) => (x.clubKey === y.clubKey ? y.year - x.year : x.clubKey.localeCompare(y.clubKey, 'ru')));
  const under = teams.filter((t) => (t.overperformance ?? 0) < 0);

  return (
    <article>
      <header>
        <div className="hd-kicker">Брифинг · {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · <b>{label ?? 'весь холдинг'}</b></div>
        <h1 className="hd-h1">{headline(a, under.length)}</h1>
        <p className="hd-lede">{label ? `Срез «${label}»: ${teams.length} ${plural(teams.length, 'команда', 'команды', 'команд')}. Переключите срез сверху, чтобы вернуться ко всему холдингу.` : <>{p.members.map((m) => `${m.label} — ${m.teams} ${plural(m.teams, 'команда', 'команды', 'команд')}`).join(', ')}; {p.years[p.years.length - 1]}–{p.years[0]} годы рождения. Всё ниже — относительно всей лиги и региона, а не внутри команды.</>}</p>
        <div className="hd-meta">
          <span><i className={`hd-meta__dot${live ? '' : ' hd-meta__dot--warn'}`} />{live ? 'Таблицы и результаты — по протоколам ФФСПб' : 'Часть таблиц — зеркало AvanData, протоколы догружаются'}</span>
          <span>Рейтинги — по разобранным матчам AvanData</span>
          <span>Обновлено {new Date(p.asOf).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </header>

      <Answers a={a} teams={teams} q={q} />
      <Week q={q} />
      <TeamsTable teams={teams} q={q} />
      <Attention a={a} q={q} />
      <Reminders q={q} />
    </article>
  );
}

// ─── Слова ────────────────────────────────────────────────────────────────────
export const plural = (n: number, one: string, few: string, many: string) => { const a = Math.abs(n) % 100, b = a % 10; if (a >= 11 && a <= 14) return many; if (b === 1) return one; if (b >= 2 && b <= 4) return few; return many; };
const teamTitle = (t: { clubLabel: string; year?: number; birthYear?: number }) => `${shortClub(t.clubLabel)} ${t.year ?? t.birthYear ?? ''}`;
const lineShort: Record<string, string> = { GK: 'вратарь', DEF: 'защитник', MID: 'полузащитник', FWD: 'нападающий' };

function headline(a: HoldingAnalytics, under: number): string {
  const ready = a.youth.ready.length, promote = a.promote.length;
  const parts: string[] = [];
  if (ready) parts.push(`${ready} ${plural(ready, 'игрок готов', 'игрока готовы', 'игроков готовы')} в молодёжную команду`);
  if (promote) parts.push(`${promote} — к переходу в ФК Динамо`);
  if (under) parts.push(`${under} ${plural(under, 'команда недобирает', 'команды недобирают', 'команд недобирают')} очков при своём составе`);
  if (!parts.length) return 'Неделя без срочных решений';
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Три ответа ───────────────────────────────────────────────────────────────
function Answers({ a, teams, q }: { a: HoldingAnalytics; teams: TeamLeague[]; q: string }) {
  const placed = teams.filter((t) => t.place != null && t.placeSize);
  const upper = placed.filter((t) => (t.place as number) <= Math.ceil((t.placeSize as number) / 2));
  const best = placed.slice().sort((x, y) => (x.place as number) / (x.placeSize as number) - (y.place as number) / (y.placeSize as number))[0];
  const gaps = teams.filter((t) => t.overperformance != null && t.overperformance !== 0).sort((x, y) => (x.overperformance as number) - (y.overperformance as number));
  const under = gaps.filter((t) => (t.overperformance as number) < 0);

  const up = [...a.youth.ready.map((p) => ({ p, tag: 'молодёжка' })), ...a.promote.map((p) => ({ p, tag: '→ ФК Динамо' }))];
  const seen = new Set<number>();
  const upList = up.filter(({ p }) => !seen.has(p.id) && seen.add(p.id)).slice(0, 5);

  const selIds = new Set(a.selection.flatMap((g) => g.candidates.map((c) => c.id)));
  const groups = a.selection.slice().sort((x, y) => y.candidates.length - x.candidates.length || x.candidates[0]!.pctRegion - y.candidates[0]!.pctRegion);
  const g0 = groups[0];

  return (
    <section className="hd-answers" aria-label="Три вопроса недели">
      <div className="hd-answer">
        <div className="hd-answer__n">01</div>
        <h2 className="hd-answer__q">Где мы среди команд региона</h2>
        <div className="hd-answer__big"><span className="hd-answer__num">{upper.length}<span className="hd-muted" style={{ fontSize: 30 }}>/{placed.length}</span></span><span className="hd-answer__unit">команд в верхней<br />половине таблицы</span></div>
        <p className="hd-answer__text">
          {best ? <>Выше всех — <b>{teamTitle(best)}</b>: {best.place}-е место из {best.placeSize}. </> : null}
          {under.length ? <><b>{under.length}</b> {plural(under.length, 'команда стоит', 'команды стоят', 'команд стоят')} ниже, чем позволяет состав по рейтингу.</> : 'Все команды стоят не ниже, чем позволяет состав.'}
        </p>
        <ul className="hd-answer__list">
          {gaps.slice(0, 2).concat(gaps.length > 2 ? gaps.slice(-1) : []).map((t) => (
            <li key={t.key}>
              <Link to={`/holding/teams/${encodeURIComponent(t.key)}${q}`}>{teamTitle(t)}</Link>
              <span className={(t.overperformance as number) < 0 ? 'hd-down' : 'hd-up'}>{(t.overperformance as number) < 0 ? `по составу ${t.ratingRank}-е, в таблице ${t.place}-е` : `в таблице ${t.place}-е при ${t.ratingRank}-м составе`}</span>
            </li>
          ))}
        </ul>
        <div className="hd-answer__foot"><a href="#teams" className="hd-link">Все команды ↓</a></div>
      </div>

      <div className="hd-answer">
        <div className="hd-answer__n">02</div>
        <h2 className="hd-answer__q">Кто готов подняться выше</h2>
        <div className="hd-answer__big"><span className="hd-answer__num">{a.youth.ready.length + a.promote.length}</span><span className="hd-answer__unit">готовы к уровню<br />выше</span></div>
        <p className="hd-answer__text">
          <b>{a.youth.ready.length}</b> — в молодёжную команду (мест {a.youthSlots}), <b>{a.promote.length}</b> — из Царского Села в ФК Динамо. Ещё <b>{a.olderAge.length}</b> тянут возраст старше в своей школе.
        </p>
        <ul className="hd-answer__list">
          {upList.map(({ p, tag }) => (
            <li key={p.id}>
              <span style={{ minWidth: 0 }}><Link to={`/holding/players/${p.id}${q}`}>{p.name}</Link> <span className="hd-muted hd-small">{teamTitle(p)} · {p.line ? lineShort[p.line] : ''}</span></span>
              <span className="hd-tag hd-tag--up">{tag}</span>
            </li>
          ))}
          {upList.length === 0 && <li className="hd-muted">пока никто не проходит пороги</li>}
        </ul>
        <div className="hd-answer__foot"><Link to={`/holding/decisions${q}`} className="hd-link">Все решения →</Link></div>
      </div>

      <div className="hd-answer">
        <div className="hd-answer__n">03</div>
        <h2 className="hd-answer__q">Кого упускает селекция</h2>
        <div className="hd-answer__big"><span className="hd-answer__num">{selIds.size}</span><span className="hd-answer__unit">игроков в более слабых<br />командах сильнее наших линий</span></div>
        <p className="hd-answer__text">
          {g0 ? <>Больше всего — для <b>{teamTitle(g0)}</b> ({LINE_TITLE[g0.line].toLowerCase()}): {g0.candidates.length} {plural(g0.candidates.length, 'кандидат', 'кандидата', 'кандидатов')}, лучший — топ-{g0.candidates[0]!.pctRegion}% региона.</> : 'Сейчас в более слабых командах нет игроков сильнее наших линий.'}
        </p>
        <ul className="hd-answer__list">
          {groups.slice(0, 4).map((g) => (
            <li key={`${g.teamKey}${g.line}`}>
              <span><b>{teamTitle(g)}</b> <span className="hd-muted hd-small">· {LINE_TITLE[g.line].toLowerCase()}</span></span>
              <span className="hd-small">{g.candidates.length} · лучший топ-{g.candidates[0]!.pctRegion}%</span>
            </li>
          ))}
        </ul>
        <div className="hd-answer__foot"><Link to={`/holding/decisions${q}#selection`} className="hd-link">Кандидаты без имён →</Link></div>
      </div>
    </section>
  );
}

// ─── За неделю ────────────────────────────────────────────────────────────────
function Week({ q }: { q: string }) {
  const ch = useHoldingChanges('week');
  const scope = useScope();
  const c = ch.data;
  return (
    <section className="hd-section">
      <div className="hd-section__head">
        <h2 className="hd-h2">Что изменилось</h2>
        <span className="hd-section__note">{c ? `сравнение: ${c.base.label}` : 'сравниваем…'} · <Link to={`/holding/changes${q}`} className="hd-link">вся динамика →</Link></span>
      </div>
      {!c ? <div className="hd-shimmer" style={{ height: 96, marginTop: 12 }} /> : <WeekItems c={scopeChanges(c, scope)} q={q} />}
    </section>
  );
}

function WeekItems({ c, q }: { c: HoldingChanges; q: string }) {
  const items: Array<{ mark: string; cls: string; body: React.ReactNode }> = [];
  for (const l of c.lists) {
    const bad = l.key === 'losing' || l.key === 'risk';
    if (l.entered.length) items.push({ mark: `+${l.entered.length}`, cls: bad ? 'hd-down' : 'hd-up', body: <><b>{LIST_SHORT[l.key]}</b>: {names(l.entered, q)}</> });
    if (l.left.length) items.push({ mark: `−${l.left.length}`, cls: bad ? 'hd-up' : 'hd-muted', body: <>Вышли из «{LIST_SHORT[l.key].toLowerCase()}»: {names(l.left, q)}</> });
  }
  if (c.risers.length) items.push({ mark: '↑', cls: 'hd-up', body: <>Выросли среди сверстников: {names(c.risers, q)}</> });
  if (c.fallers.length) items.push({ mark: '↓', cls: 'hd-down', body: <>Опустились среди сверстников: {names(c.fallers, q)}</> });
  for (const l of c.lines.sagged.slice(0, 2)) items.push({ mark: '!', cls: 'hd-warn', body: <>Просела линия <b>{shortClub(l.clubLabel)} {l.year} · {l.title.toLowerCase()}</b>: {pct(l.gapBefore)} → {pct(l.gapNow)} к лиге</> });
  if (!items.length) return <div className="hd-empty">За это время списки решений не изменились.</div>;
  return <div className="hd-week">{items.slice(0, 8).map((it, i) => <div key={i} className="hd-week__item"><span className={`hd-week__mark ${it.cls}`}>{it.mark}</span><span>{it.body}</span></div>)}</div>;
}
const pct = (x: number | null) => (x == null ? '—' : `${pm(Math.round(x * 100))}%`);
function names(ps: Array<{ id: number; name: string }>, q: string) {
  const shown = ps.slice(0, 3);
  return <>{shown.map((p, i) => <span key={p.id}>{i > 0 ? ', ' : ''}<Link to={`/holding/players/${p.id}${q}`} style={{ textDecoration: 'none', fontWeight: 600 }}>{p.name}</Link></span>)}{ps.length > 3 ? ` и ещё ${ps.length - 3}` : ''}</>;
}

// ─── Все команды против лиги ──────────────────────────────────────────────────
function TeamsTable({ teams, q }: { teams: TeamLeague[]; q: string }) {
  const navigate = useNavigate();
  return (
    <section className="hd-section" id="teams" style={{ scrollMarginTop: 80 }}>
      <div className="hd-section__head">
        <h2 className="hd-h2">Команды против лиги</h2>
        <span className="hd-section__note">● место в таблице · ○ место по силе состава (рейтинг AvanData)</span>
      </div>
      <div className="hd-scroll">
        <table className="hd-table">
          <thead><tr><th>Команда</th><th className="num">Место</th><th className="hd-hide-sm">Таблица и состав</th><th>Итог</th><th className="num">Средний класс</th><th className="hd-hide-sm">Линии к лиге</th></tr></thead>
          <tbody>
            {teams.map((t) => <TeamRow key={t.key} t={t} onOpen={() => navigate(`/holding/teams/${encodeURIComponent(t.key)}${q}`)} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeamRow({ t, onOpen }: { t: TeamLeague; onOpen: () => void }) {
  const o = t.overperformance;
  const size = t.placeSize ?? t.ratingSize ?? 0;
  const x = (n: number | null) => (n == null || size <= 1 ? null : ((n - 1) / (size - 1)) * 100);
  const xt = x(t.place), xr = x(t.ratingRank);
  const lines = t.lines.filter((l) => l.verdict === 'weak' || l.verdict === 'strong');
  return (
    <tr className="hd-row-link" onClick={onOpen}>
      <td>
        <div className="hd-team">
          <span className="hd-team__name">{teamTitle(t)}<span className="hd-team__sub">{t.ageTitle} · {t.division}</span></span>
        </div>
      </td>
      <td className="num"><span className="hd-place">{t.place ?? '—'}<small>{t.placeSize ? `из ${t.placeSize}` : ''}</small></span></td>
      <td className="hd-hide-sm">
        {xt != null && xr != null ? (
          <div className="hd-gap" title={`в таблице ${t.place}-е, по составу ${t.ratingRank}-е из ${size}`}>
            <div className="hd-gap__track" />
            <div className="hd-gap__span" style={{ left: `${Math.min(xt, xr)}%`, width: `${Math.abs(xt - xr)}%`, background: (o ?? 0) < 0 ? 'var(--down)' : 'var(--up)' }} />
            <div className="hd-gap__dot hd-gap__dot--rating" style={{ left: `${xr}%` }} />
            <div className="hd-gap__dot hd-gap__dot--table" style={{ left: `${xt}%` }} />
          </div>
        ) : <span className="hd-muted">—</span>}
      </td>
      <td>{o == null ? <span className="hd-muted">—</span> : o < 0 ? <span className="hd-tag hd-tag--down">недобирает {-o}</span> : o > 0 ? <span className="hd-tag hd-tag--up">выше состава на {o}</span> : <span className="hd-tag">по составу</span>}</td>
      <td className="num"><span className="hd-rating">{t.avgRating != null ? num(t.avgRating) : '—'}</span><span className="hd-team__sub">{t.divAvgRating != null ? `лига ${num(t.divAvgRating)} · ${t.divRankByAvg}-е из ${t.divTeams}` : ''}</span></td>
      <td className="hd-hide-sm">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {lines.length === 0 && <span className="hd-muted hd-small">на уровне лиги</span>}
          {lines.map((l) => <span key={l.line} className={`hd-tag ${l.verdict === 'weak' ? 'hd-tag--down' : 'hd-tag--up'}`}>{l.title.toLowerCase()} {pm(Math.round((l.gapRel ?? 0) * 100))}%</span>)}
        </div>
      </td>
    </tr>
  );
}

// ─── Требует внимания ─────────────────────────────────────────────────────────
function Attention({ a, q }: { a: HoldingAnalytics; q: string }) {
  const who = (p: LeaguePlayer) => `${teamTitle(p)} · ${p.line ? lineShort[p.line] : '—'}`;
  return (
    <section className="hd-section">
      <div className="hd-section__head"><h2 className="hd-h2">Требует внимания</h2><Link to={`/holding/decisions${q}#losing`} className="hd-link">подробно в решениях →</Link></div>
      <div className="hd-cols">
        <div className="hd-col">
          <h3>Кого теряем <span className="hd-down">{a.losing.length}</span></h3>
          <p>Падение формы или выпал из ротации</p>
          <ul className="hd-list">
            {a.losing.slice(0, 6).map((p) => (
              <li key={p.id}><Link to={`/holding/players/${p.id}${q}`}>{p.name}</Link><span className="hd-rating">{p.rating != null ? num(p.rating) : '—'}</span><span className="hd-list__sub">{who(p)} · {p.reason === 'trend' ? `форма ${p.trend != null ? pm(p.trend) : ''} к сезону` : 'не играл последние туры'}</span></li>
            ))}
            {a.losing.length === 0 && <li className="hd-muted">никого</li>}
          </ul>
        </div>
        <div className="hd-col">
          <h3>Зона риска <span className="hd-warn">{a.risk.length}</span></h3>
          <p>В ФК Динамо, но ниже медианы Первой лиги</p>
          <ul className="hd-list">
            {a.risk.slice(0, 6).map((p) => (
              <li key={p.id}><Link to={`/holding/players/${p.id}${q}`}>{p.name}</Link><span className="hd-rating">{p.rating != null ? num(p.rating) : '—'}</span><span className="hd-list__sub">{who(p)} · {p.rankRegion != null ? `${p.rankRegion}-й из ${p.sizeRegion} в регионе` : ''}</span></li>
            ))}
            {a.risk.length === 0 && <li className="hd-muted">никого</li>}
          </ul>
        </div>
        <div className="hd-col">
          <h3>Слабые линии <span className="hd-warn">{a.weakLines.length}</span></h3>
          <p>Средний рейтинг линии ниже лиги на 12%+</p>
          <ul className="hd-list">
            {a.weakLines.slice(0, 6).map((l) => (
              <li key={`${l.teamKey}${l.line}`}><Link to={`/holding/teams/${encodeURIComponent(l.teamKey)}${q}`}>{teamTitle(l)} · {l.title.toLowerCase()}</Link><span className="hd-down hd-rating">{pm(Math.round(l.gapRel * 100))}%</span><span className="hd-list__sub">{num(l.teamAvg)} против {num(l.divAvg)} в лиге</span></li>
            ))}
            {a.weakLines.length === 0 && <li className="hd-muted">нет</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ─── Напоминания ──────────────────────────────────────────────────────────────
function Reminders({ q }: { q: string }) {
  const can = useCanNote();
  const notes = useNotes();
  const scope = useScope();
  if (!can) return null;
  const list = (notes.data?.notes ?? []).filter((n) => !n.closedAt && (!n.now || inScope(scope, { teamKey: n.now.teamKey }))).sort((x, y) => Number(y.due) - Number(x.due)).slice(0, 6);
  return (
    <section className="hd-section">
      <div className="hd-section__head"><h2 className="hd-h2">Решения в работе</h2><Link to={`/holding/journal${q}`} className="hd-link">журнал решений →</Link></div>
      {list.length === 0 ? <div className="hd-empty">Решений пока нет. Откройте игрока и запишите решение — кабинет напомнит о нём в нужный день.</div> : (
        <ul className="hd-list">
          {list.map((n) => (
            <li key={n.id}>
              <span><Link to={`/holding/players/${n.playerId}${q}`}>{n.playerName}</Link> <span className="hd-tag hd-tag--brand" style={{ marginLeft: 6 }}>{NOTE_KIND[n.kind]}</span></span>
              <span className={n.due ? 'hd-warn hd-small' : 'hd-muted hd-small'} style={{ fontWeight: n.due ? 700 : 400 }}>{n.remindOn ? (n.due ? `пора вернуться · ${fmtDay(n.remindOn)}` : `напомнить ${fmtDay(n.remindOn)}`) : 'без напоминания'}</span>
              <span className="hd-list__sub">{n.text || '—'}{n.now?.rating != null && n.ratingAt != null ? ` · рейтинг ${num(n.ratingAt)} → ${num(n.now.rating)}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

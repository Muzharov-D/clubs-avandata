/**
 * Public родительский экран — без auth, tenant из URL path.
 * URL: /m/:slug/team/:age (например /m/zenit-fk/team/2011)
 *
 * Что показывает:
 *  - Бренд клуба (логотип, цвет, название)
 *  - Ближайший матч команды
 *  - Турнирную таблицу (с подсветкой нашей строки)
 *  - Состав команды (16 игроков)
 *  - Кнопки: «Скачать ICS» и «Подписаться на push» (заглушки на демо)
 *
 * Полностью отдельная страница — НЕ Legacy Легируса. Минимум зависимостей,
 * читает данные через /api/v1/public/:slug/* (no auth).
 */
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import './PublicTenantTeam.css';

interface Tenant {
  slug: string;
  name: string;
  displayName: string;
  brand: { primary?: string; accent?: string };
}
interface Player {
  id: string;
  fullName: string;
  number: number | null;
  position: string | null;
  photoUrl: string | null;
}
interface StandingRow {
  pos: number;
  team: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  missed: number;
  points: number;
  isOurClub: boolean;
}
interface NextMatch {
  matchId: string;
  date: string;
  home: string;
  away: string;
  venue: string | null;
  round: string | null;
}
interface TeamComposite {
  team: { id: string; name: string; ageGroup: string; ageLabel: string | null; headCoach: string | null } | null;
  players: Player[];
  nextMatch: NextMatch | null;
  standings: { table: StandingRow[]; leagueName: string } | null;
}

export function PublicTenantTeam() {
  const { slug = '', age = '' } = useParams();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [data, setData] = useState<TeamComposite | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/v1/public/tenant/${slug}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/v1/public/${slug}/team/${age}`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([t, d]) => {
        if (cancelled) return;
        if (!t || !d) { setError('Команда не найдена'); return; }
        setTenant(t);
        setData(d);
        const root = document.documentElement;
        if (t.brand?.primary) root.style.setProperty('--pub-brand', t.brand.primary);
        if (t.brand?.accent)  root.style.setProperty('--pub-accent', t.brand.accent);
        document.title = `${t.displayName} ${d.team?.ageLabel ?? `U-${age}`} · Расписание`;
      })
      .catch(() => { if (!cancelled) setError('Ошибка загрузки'); });
    return () => { cancelled = true; };
  }, [slug, age]);

  if (error) {
    return (
      <div className="pub">
        <div className="pub__empty">{error}</div>
      </div>
    );
  }
  if (!tenant || !data) {
    return (
      <div className="pub">
        <div className="pub__skeleton">Загружаем расписание команды…</div>
      </div>
    );
  }

  const { team, players, nextMatch, standings } = data;
  const ourRow = standings?.table?.find((r) => r.isOurClub);

  return (
    <div className="pub" data-testid="public-team">
      {/* Bg glow */}
      <div className="pub__glow" aria-hidden />

      {/* Header */}
      <header className="pub__header">
        <div className="pub__brand">
          <div className="pub__brand-mark" style={{ background: tenant.brand?.primary ?? '#2563eb' }}>
            {tenant.displayName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div>
            <div className="pub__brand-name">{tenant.displayName}</div>
            <div className="pub__brand-team">
              {team?.name} · {team?.ageLabel ?? `U-${age}`}
            </div>
          </div>
        </div>
        <Link to="/" className="pub__powered">avandata.ru ↗</Link>
      </header>

      {/* Next match hero */}
      {nextMatch && (
        <section className="pub__hero">
          <div className="pub__hero-eyebrow">Ближайший матч · {nextMatch.round ?? ''}</div>
          <div className="pub__hero-matchup">
            <div className={`pub__hero-team ${nextMatch.home.toLowerCase().includes('зенит') ? 'pub__hero-team--us' : ''}`}>
              <span className="pub__hero-team-name">{nextMatch.home}</span>
            </div>
            <div className="pub__hero-vs">vs</div>
            <div className={`pub__hero-team ${nextMatch.away.toLowerCase().includes('зенит') ? 'pub__hero-team--us' : ''}`}>
              <span className="pub__hero-team-name">{nextMatch.away}</span>
            </div>
          </div>
          <div className="pub__hero-meta">
            <span>{formatDateRu(nextMatch.date)}</span>
            {nextMatch.venue && <span> · {nextMatch.venue}</span>}
          </div>
          <div className="pub__hero-actions">
            <button className="pub__btn pub__btn--primary">Добавить в календарь</button>
            <button className="pub__btn pub__btn--ghost">🔔 Push-уведомления</button>
          </div>
        </section>
      )}

      {/* Standings */}
      {standings && (
        <section className="pub__card">
          <div className="pub__card-header">
            <h2 className="pub__card-title">Турнирная таблица</h2>
            <span className="pub__card-sub">{standings.leagueName}</span>
          </div>
          <div className="pub__table-wrap">
            <table className="pub__table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Команда</th>
                  <th>И</th>
                  <th>В</th>
                  <th>Н</th>
                  <th>П</th>
                  <th>М</th>
                  <th>О</th>
                </tr>
              </thead>
              <tbody>
                {standings.table.map((r) => (
                  <tr key={r.pos} className={r.isOurClub ? 'pub__row--us' : ''}>
                    <td className="pub__pos">{r.pos}</td>
                    <td className="pub__team-cell">{r.team}</td>
                    <td>{r.games}</td>
                    <td>{r.wins}</td>
                    <td>{r.draws}</td>
                    <td>{r.losses}</td>
                    <td>{r.scored}-{r.missed}</td>
                    <td className="pub__points">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ourRow && (
            <div className="pub__our-summary">
              <strong>{ourRow.team}</strong> · <span style={{ color: 'var(--pub-accent, #1FB6FF)' }}>{ourRow.pos} место</span>
              <span> · {ourRow.wins}-{ourRow.draws}-{ourRow.losses} · {ourRow.points} очков</span>
            </div>
          )}
        </section>
      )}

      {/* Roster */}
      <section className="pub__card">
        <div className="pub__card-header">
          <h2 className="pub__card-title">Состав ({players.length})</h2>
          <span className="pub__card-sub">Тренер: {team?.headCoach ?? '—'}</span>
        </div>
        <div className="pub__roster">
          {players.map((p) => (
            <div key={p.id} className="pub__player">
              <div className="pub__player-num" style={{ borderColor: tenant.brand?.primary ?? '#2563eb' }}>
                {p.number ?? '—'}
              </div>
              <div className="pub__player-info">
                <div className="pub__player-name">{p.fullName}</div>
                <div className="pub__player-pos">{p.position ?? ''}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="pub__footer">
        clubs.avandata.ru · {tenant.displayName}
      </footer>
    </div>
  );
}

function formatDateRu(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', weekday: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

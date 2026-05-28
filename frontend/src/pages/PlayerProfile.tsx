/**
 * PlayerProfile — детальный профиль игрока (заменяет legacy PlayerDetail).
 *
 * Слои:
 *   1. Hero: номер + имя + позиция + минуты + overall rating
 *   2. Badges «Лучший в команде» — top-3 по каждой метрике
 *   3. Radar — 8 категорий из Excel stats
 *   4. Ключевые цифры (атака/пасы/защита/фитнес)
 *   5. Детальные stats grid — все категории Excel с полями
 *   6. Splits 1-й / 2-й тайм если есть
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchPlayer, fetchMatches, fetchMatch,
} from '../services/api';
import { PlayerRadar } from '../components/PlayerRadar';
import './PlayerProfile.css';

type AnyObj = Record<string, any>;

const KEY_METRICS: Array<{ label: string; path: string; suffix?: string; format?: (v: number) => string }> = [
  { label: 'Голы',         path: 'attacking.goal' },
  { label: 'xG',           path: 'attacking.xg', format: (v) => v.toFixed(2) },
  { label: 'Удары',        path: 'attacking.udary' },
  { label: 'В створ',      path: 'attacking.udary_v_stvor' },
  { label: 'Пасы',         path: 'passing.pas' },
  { label: 'Точность',     path: 'passing.tochnost_pasov', suffix: '%' },
  { label: 'Отборы',       path: 'defending.otbory' },
  { label: 'Перехваты',    path: 'defending.perehvaty' },
  { label: 'Дистанция',    path: 'fitness.obschaya_distanciya', format: (v) => `${(v / 1000).toFixed(1)} км` },
  { label: 'Спринты',      path: 'fitness.sprinty' },
  { label: 'Дриблинг',     path: 'dribbling.obvodki' },
  { label: 'Удачн. обвод', path: 'dribbling.udachnye_obvodki' },
];

// Группы для детальных секций — лучшие 12 полей из каждой группы
const STAT_GROUPS = [
  { key: 'attacking', label: 'Атака' },
  { key: 'passing',   label: 'Пасы' },
  { key: 'defending', label: 'Защита' },
  { key: 'duels',     label: 'Единоборства' },
  { key: 'pressing',  label: 'Прессинг' },
  { key: 'dribbling', label: 'Дриблинг' },
  { key: 'fitness',   label: 'Фитнес' },
  { key: 'setpieces', label: 'Стандарты' },
  { key: 'fouls',     label: 'Фолы' },
];

const BADGE_METRICS = [
  { label: 'Голы',       getter: (p: AnyObj) => num(p, 'stats.attacking.goal') },
  { label: 'xG',         getter: (p: AnyObj) => num(p, 'stats.attacking.xg') },
  { label: 'Удары',      getter: (p: AnyObj) => num(p, 'stats.attacking.udary') },
  { label: 'Рейтинг',    getter: (p: AnyObj) => num(p, 'ratings.overall') },
  { label: 'Пасы',       getter: (p: AnyObj) => num(p, 'stats.passing.pas') },
  { label: 'Точность',   getter: (p: AnyObj) => num(p, 'stats.passing.tochnost_pasov') },
  { label: 'Отборы',     getter: (p: AnyObj) => num(p, 'stats.defending.otbory') },
  { label: 'Дистанция',  getter: (p: AnyObj) => num(p, 'stats.fitness.obschaya_distanciya') },
  { label: 'Единоборства', getter: (p: AnyObj) => num(p, 'stats.duels.vyigrannye_edinoborstva') },
];

export default function PlayerProfile() {
  const { playerId = '' } = useParams();
  const navigate = useNavigate();

  const [player, setPlayer]       = useState<AnyObj | null>(null);
  const [match, setMatch]         = useState<AnyObj | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const p = await fetchPlayer(playerId).catch(() => null);
        if (!p?.player) { setError('Игрок не найден'); return; }
        if (cancelled) return;
        setPlayer(p.player);

        const ms = await fetchMatches(p.player.teamId).catch(() => ({ matches: [] }));
        const matches = (ms as AnyObj)?.matches ?? [];
        if (matches.length === 0) return;

        const detail = await fetchMatch(matches[0].id).catch(() => null);
        if (!cancelled && detail) setMatch(detail as AnyObj);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  // Player данные из матча — это PER-MATCH stats. Player из /player — общая инфа.
  const mp = useMemo<AnyObj | null>(() => {
    if (!match) return null;
    return (match.players as AnyObj[])?.find((p) => p.id === playerId) ?? null;
  }, [match, playerId]);

  const badges = useMemo(() => {
    if (!match || !mp) return [];
    const all = (match.players ?? []) as AnyObj[];
    const out: Array<{ rank: number; label: string; value: number }> = [];
    for (const m of BADGE_METRICS) {
      const ranked = [...all]
        .map((p) => ({ p, v: m.getter(p) }))
        .filter((r) => Number.isFinite(r.v) && r.v > 0)
        .sort((a, b) => b.v - a.v);
      const idx = ranked.findIndex((r) => r.p.id === playerId);
      if (idx >= 0 && idx < 3) {
        const my = ranked[idx];
        if (my) out.push({ rank: idx + 1, label: m.label, value: my.v });
      }
    }
    return out.sort((a, b) => a.rank - b.rank);
  }, [match, mp, playerId]);

  if (loading) return <div className="pp"><div className="pp__loading">Загрузка профиля…</div></div>;
  if (error)   return <div className="pp"><div className="pp__error">{error}</div></div>;
  if (!player) return null;

  const overall = mp?.ratings?.overall;
  const matchTitle = match ? `${match.home} ${match.scoreHome}:${match.scoreAway} ${match.away}` : null;

  return (
    <div className="pp">
      <div className="pp__bg-glow" aria-hidden />

      <button className="pp__back" onClick={() => navigate(-1)}>← Назад</button>

      {/* Hero */}
      <header className="pp__hero">
        <div className="pp__hero-num" style={{ background: overall ? ratingColor(overall) : '#374151' }}>
          {player.number ?? mp?.number ?? '—'}
        </div>
        <div className="pp__hero-info">
          <div className="pp__hero-position">{(mp?.position || player.position || '').toUpperCase()}{mp?.minutes ? ` · ${mp.minutes}'` : ''}</div>
          <h1 className="pp__hero-name">{player.fullName}</h1>
          {matchTitle && (
            <div className="pp__hero-match">по матчу: {matchTitle}</div>
          )}
        </div>
        {overall != null && (
          <div className="pp__hero-rating" style={{ background: ratingColor(overall) }}>
            <div className="pp__hero-rating-val">{Number(overall).toFixed(1)}</div>
            <div className="pp__hero-rating-label">Рейтинг</div>
          </div>
        )}
      </header>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="pp__badges">
          {badges.map((b, i) => (
            <div key={i} className={`pp__badge pp__badge--rank${b.rank}`}>
              <span className="pp__badge-icon">{b.rank === 1 ? '🥇' : b.rank === 2 ? '🥈' : '🥉'}</span>
              <span className="pp__badge-label">{b.label}</span>
              <span className="pp__badge-val">{formatBadge(b.label, b.value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Two-column: Radar + Key metrics */}
      {mp && (
        <section className="pp__columns">
          <div className="pp__panel">
            <div className="pp__panel-header">
              <h2 className="pp__panel-title">Профиль матча</h2>
              <span className="pp__panel-sub">8 категорий относительно команды</span>
            </div>
            <PlayerRadar player={mp} teamPlayers={(match?.players ?? []) as AnyObj[]} />
          </div>

          <div className="pp__panel">
            <div className="pp__panel-header">
              <h2 className="pp__panel-title">Ключевые цифры</h2>
              <span className="pp__panel-sub">{matchTitle}</span>
            </div>
            <div className="pp__keymetrics">
              {KEY_METRICS.map((km) => {
                const v = num(mp, `stats.${km.path}`);
                return (
                  <div key={km.path} className="pp__keymetric">
                    <div className="pp__keymetric-label">{km.label}</div>
                    <div className="pp__keymetric-value">
                      {v != null && Number.isFinite(v)
                        ? (km.format ? km.format(v) : Math.round(v).toLocaleString('ru-RU'))
                        : '—'}
                      {km.suffix && Number.isFinite(v) && v > 0 ? <span className="pp__keymetric-suffix">{km.suffix}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Splits */}
      {mp?.splits && Object.keys(mp.splits).length > 0 && (
        <section className="pp__panel">
          <div className="pp__panel-header">
            <h2 className="pp__panel-title">По таймам</h2>
            <span className="pp__panel-sub">1-й / 2-й / общий</span>
          </div>
          <div className="pp__splits">
            {Object.entries(mp.splits as Record<string, AnyObj>).map(([k, val]) => (
              <div key={k} className="pp__split">
                <div className="pp__split-label">{humanize(k)}</div>
                <div className="pp__split-vals">
                  <span>{formatNum(val?.first)}</span>
                  <span>{formatNum(val?.second)}</span>
                  <span className="pp__split-total">{formatNum(val?.match)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Detailed stats by Excel group */}
      {mp?.stats && (
        <section className="pp__panel">
          <div className="pp__panel-header">
            <h2 className="pp__panel-title">Полная статистика</h2>
            <span className="pp__panel-sub">SportVisor · все колонки Excel</span>
          </div>
          <div className="pp__groups">
            {STAT_GROUPS.map((g) => {
              const gv = (mp.stats as AnyObj)[g.key];
              if (!gv || Object.keys(gv).length === 0) return null;
              return (
                <div key={g.key} className="pp__group">
                  <div className="pp__group-title">{g.label}</div>
                  <div className="pp__group-grid">
                    {Object.entries(gv as AnyObj)
                      .filter(([, v]) => v != null && v !== 0)
                      .slice(0, 16)
                      .map(([k, v]) => (
                        <div key={k} className="pp__group-row">
                          <span className="pp__group-key">{humanize(k)}</span>
                          <span className="pp__group-val">{formatNum(v)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function num(obj: AnyObj | null | undefined, path: string): number {
  if (!obj) return NaN;
  const v = path.split('.').reduce<any>((acc, k) => acc?.[k], obj);
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const inner = v.value ?? v.pct;
    return inner == null ? NaN : Number(inner);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function formatNum(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'object') v = v.value ?? v.pct ?? null;
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString('ru-RU');
  return n.toFixed(n < 10 ? 2 : 0);
}
function formatBadge(label: string, v: number): string {
  if (label === 'Дистанция') return `${(v / 1000).toFixed(1)} км`;
  if (label === 'Точность')  return `${v.toFixed(0)}%`;
  if (label === 'Рейтинг')   return v.toFixed(1);
  if (Number.isInteger(v))   return v.toString();
  return v.toFixed(2);
}
function humanize(k: string): string {
  return k
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}
function ratingColor(r: number | null | undefined): string {
  if (r == null) return '#475569';
  if (r >= 8.5) return 'linear-gradient(135deg, #16a34a, #22c55e)';
  if (r >= 7.5) return 'linear-gradient(135deg, #22c55e, #84cc16)';
  if (r >= 6.5) return 'linear-gradient(135deg, #84cc16, #facc15)';
  if (r >= 5.5) return 'linear-gradient(135deg, #facc15, #f97316)';
  return 'linear-gradient(135deg, #ef4444, #f97316)';
}

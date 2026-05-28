/**
 * PlayerProfile — детальный профиль игрока из SportVisor rich PDF.
 *
 * Структура `mp.stats` (после parse_zenit_full.py):
 *   stats.attack:  {goal, shot, pass, keyPass, cross, assist, ...38 полей}
 *   stats.defence: {tackle, interception, recovery, save, clearance, ...20 полей}
 *   stats.fitness: {totalDistance, sprintsCount, sprintDistance, averageSpeed}
 *
 * Compound значения: {total, accuracy, successful} или {value, total, accuracy}.
 *
 * Excel-fallback группы (если backend дотянул из xlsx):
 *   stats.passing / stats.duels / stats.pressing / stats.dribbling / stats.setpieces
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchPlayer, fetchMatches, fetchMatch,
} from '../services/api';
import { PlayerRadar } from '../components/PlayerRadar';
import './PlayerProfile.css';

type AnyObj = Record<string, any>;

// ─── Ключевые цифры — приоритетно из stats.attack / stats.defence / stats.fitness ──
const KEY_METRICS: Array<{ label: string; getter: (s: AnyObj) => string }> = [
  { label: 'Голы',         getter: (s) => fmtInt(deep(s, 'attack.goal')) },
  { label: 'Удары',        getter: (s) => fmtCompound(deep(s, 'attack.shot')) },
  { label: 'Голевые дейст.', getter: (s) => fmtInt(deep(s, 'attack.goalActions')) },
  { label: 'Передачи',     getter: (s) => fmtCompound(deep(s, 'attack.pass')) },
  { label: 'Ключевые',     getter: (s) => fmtCompound(deep(s, 'attack.keyPass')) },
  { label: 'Кроссы',       getter: (s) => fmtCompound(deep(s, 'attack.cross')) },
  { label: 'Ассисты',      getter: (s) => fmtInt(deep(s, 'attack.assist')) },
  { label: 'Дриблинг',     getter: (s) => fmtCompound(deep(s, 'attack.dribble')) },
  { label: 'Отборы',       getter: (s) => fmtCompound(deep(s, 'defence.tackle')) },
  { label: 'Перехваты',    getter: (s) => fmtCompound(deep(s, 'defence.interception')) },
  { label: 'Возвраты',     getter: (s) => fmtCompound(deep(s, 'defence.recovery')) },
  { label: 'Дуэли',        getter: (s) => fmtCompound(deep(s, 'defence.duel')) },
  { label: 'Воздух',       getter: (s) => fmtCompound(deep(s, 'defence.aerialDuel')) },
  { label: 'Дистанция',    getter: (s) => fmtDistance(deep(s, 'fitness.totalDistance')) },
  { label: 'Спринты',      getter: (s) => fmtInt(deep(s, 'fitness.sprintsCount')) },
  { label: 'Спринт-км',    getter: (s) => fmtDistance(deep(s, 'fitness.sprintDistance')) },
];

// Группы для секции «Полная статистика» — порядок отображения и человеческие названия
const STAT_GROUPS: Array<{ key: string; label: string }> = [
  { key: 'attack',  label: 'Атака' },
  { key: 'defence', label: 'Защита' },
  { key: 'fitness', label: 'Фитнес' },
  // Excel-fallback (если есть)
  { key: 'passing',   label: 'Пасы (детально)' },
  { key: 'duels',     label: 'Единоборства' },
  { key: 'pressing',  label: 'Прессинг' },
  { key: 'dribbling', label: 'Дриблинг (детально)' },
  { key: 'setpieces', label: 'Стандарты' },
];

// Бейджи «Лучший в команде» — top-3 по этим метрикам
const BADGE_METRICS: Array<{ label: string; getter: (p: AnyObj) => number }> = [
  { label: 'Голы',         getter: (p) => num(deep(p.stats, 'attack.goal')) },
  { label: 'Удары',        getter: (p) => num(deep(p.stats, 'attack.shot'), 'total') },
  { label: 'Ассисты',      getter: (p) => num(deep(p.stats, 'attack.assist')) },
  { label: 'Ключевые',     getter: (p) => num(deep(p.stats, 'attack.keyPass'), 'successful') },
  { label: 'Рейтинг',      getter: (p) => Number(p?.ratings?.overall ?? 0) },
  { label: 'Точность пас', getter: (p) => num(deep(p.stats, 'attack.pass'), 'accuracy') },
  { label: 'Отборы',       getter: (p) => num(deep(p.stats, 'defence.tackle'), 'successful') },
  { label: 'Перехваты',    getter: (p) => num(deep(p.stats, 'defence.interception'), 'successful') },
  { label: 'Дистанция',    getter: (p) => num(deep(p.stats, 'fitness.totalDistance')) },
  { label: 'Спринты',      getter: (p) => num(deep(p.stats, 'fitness.sprintsCount')) },
  { label: 'Дуэли',        getter: (p) => num(deep(p.stats, 'defence.duel'), 'successful') },
];

// Человеческие названия полей внутри групп
const FIELD_LABELS: Record<string, string> = {
  // attack
  goal: 'Голы', shot: 'Удары', goalActions: 'Голевые действия', pass: 'Передачи',
  passProgressing: 'Прогрес. пасы', passForward: 'Вперёд', passBack: 'Назад',
  passSideways: 'В сторону', passShort: 'Короткие', passMiddle: 'Средние',
  passLong: 'Длинные', passToFinalThird: 'В финальную треть',
  intoPenArea: 'В штрафную', progressivePass: 'Прогресс. пас', keyPass: 'Ключевые',
  cross: 'Кроссы', entriesInBox: 'Входы в штрафную', assist: 'Ассисты',
  secondAssist: 'Пред-ассисты', thirdAssist: 'Пре-пред-ассисты',
  passOnTarget: 'Пас на удар', offside: 'Офсайды', byHead: 'Удары головой',
  touchesInPenArea: 'Касания в штрафной', receivedPass: 'Принял пас',
  foulsSuffered: 'Заработ. фолы', loseOnOwnHalf: 'Потери на своей',
  dangerousLosesOnOwnHalf: 'Опасные потери', ownGoal: 'Автоголы',
  lostBall: 'Потери', technicalMistake: 'Брак', dribble: 'Дриблинг',
  dribbleProgressing: 'Прогрес. дриблинг', freeKickShot: 'Штр. с ударом',
  freeKick: 'Штрафные', directFreeKick: 'Прямые штр.',
  directFreeKickShot: 'Прямой штр. удар', penalty: 'Пенальти',
  corner: 'Угловые', throwing: 'Ауты',
  // defence
  tackle: 'Отборы', slidingTackles: 'В подкате', dribbleAgainst: 'Дриблинг против',
  recovery: 'Возвраты', recoveryOpp: 'Возвраты у соп.', interception: 'Перехваты',
  positionPlay: 'Поз. игра', dangerousLossOwn: 'Опасные потери',
  clearance: 'Выносы', blockedShot: 'Блок-удары', duel: 'Дуэли',
  aerialDuel: 'Воздух', duelWon: 'Дуэли выигр.', pressing: 'Прессинг',
  counterpressing: 'Контр-прессинг', save: 'Сэйвы',
  goalkeeperExits: 'Выходы вр.', shotsAgainst: 'Удары по в.',
  goalKick: 'От ворот', shortGoalKicks: 'Корот. от вор.',
  longGoalKicks: 'Длинные от вор.',
  // fitness
  totalDistance: 'Общая дистанция', speed_4_5_5: 'Скор. 4.5-5',
  speed_5_5_7: 'Скор. 5.5-7', speed_7plus: 'Скор. 7+',
  sprintDistance: 'Спринт-дистанция', sprintsCount: 'Спринты',
  intenseRunning: 'Интенс. бег', averageSpeed: 'Сред. скор.',
};

export default function PlayerProfile() {
  const { playerId = '' } = useParams();
  const navigate = useNavigate();

  const [player, setPlayer]   = useState<AnyObj | null>(null);
  const [match, setMatch]     = useState<AnyObj | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          <div className="pp__hero-position">
            {(mp?.position || player.position || '').toUpperCase()}
            {mp?.minutes ? ` · ${mp.minutes}'` : ''}
          </div>
          <h1 className="pp__hero-name">{player.fullName}</h1>
          {matchTitle && <div className="pp__hero-match">по матчу: {matchTitle}</div>}
        </div>
        {overall != null && (
          <div className="pp__hero-rating" style={{ background: ratingColor(overall) }}>
            <div className="pp__hero-rating-val">{Number(overall).toFixed(1)}</div>
            <div className="pp__hero-rating-label">Рейтинг</div>
          </div>
        )}
      </header>

      {/* Sub-ratings (attack/defence/fitness/setpiece) */}
      {mp?.radar && (
        <div className="pp__subrating">
          <SubRating label="Атака"   value={mp.radar.attackTotal  ?? mp.radar.attackRating}  />
          <SubRating label="Защита"  value={mp.radar.defenceTotal ?? mp.radar.defenceRating} />
          <SubRating label="Фитнес"  value={mp.radar.fitnessTotal ?? mp.radar.fitnessRating} />
          <SubRating label="Стандарты" value={mp.radar.setPiece} />
        </div>
      )}

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
              <span className="pp__panel-sub">8 категорий Performance Index</span>
            </div>
            <PlayerRadar player={mp} teamPlayers={(match?.players ?? []) as AnyObj[]} />
          </div>

          <div className="pp__panel">
            <div className="pp__panel-header">
              <h2 className="pp__panel-title">Ключевые цифры</h2>
              <span className="pp__panel-sub">{matchTitle}</span>
            </div>
            <div className="pp__keymetrics">
              {KEY_METRICS.map((km, i) => {
                const v = km.getter(mp.stats ?? {});
                return (
                  <div key={i} className="pp__keymetric">
                    <div className="pp__keymetric-label">{km.label}</div>
                    <div className="pp__keymetric-value">{v}</div>
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

      {/* Detailed stats by group */}
      {mp?.stats && (
        <section className="pp__panel">
          <div className="pp__panel-header">
            <h2 className="pp__panel-title">Полная статистика</h2>
            <span className="pp__panel-sub">SportVisor · все поля отчёта</span>
          </div>
          <div className="pp__groups">
            {STAT_GROUPS.map((g) => {
              const gv = (mp.stats as AnyObj)[g.key];
              if (!gv || Object.keys(gv).length === 0) return null;
              const rows = Object.entries(gv as AnyObj)
                .filter(([, v]) => !isEmpty(v))
                .sort(([a], [b]) => a.localeCompare(b));
              if (rows.length === 0) return null;
              return (
                <div key={g.key} className="pp__group">
                  <div className="pp__group-title">{g.label}</div>
                  <div className="pp__group-grid">
                    {rows.map(([k, v]) => (
                      <div key={k} className="pp__group-row">
                        <span className="pp__group-key">{FIELD_LABELS[k] ?? humanize(k)}</span>
                        <span className="pp__group-val">{formatValue(v, k)}</span>
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
// Components
// ============================================================================

function SubRating({ label, value }: { label: string; value: unknown }) {
  const v = num(value);
  if (!Number.isFinite(v) || v <= 0) return null;
  return (
    <div className="pp__subrating-item">
      <div className="pp__subrating-label">{label}</div>
      <div className="pp__subrating-val" style={{ color: ratingTextColor(v) }}>{v.toFixed(1)}</div>
    </div>
  );
}

// ============================================================================
// Value formatters — handle compound {total, accuracy, successful} dicts
// ============================================================================

function deep(obj: AnyObj | null | undefined, path: string): any {
  if (!obj) return undefined;
  return path.split('.').reduce<any>((a, k) => a?.[k], obj);
}

function num(v: unknown, key: 'value' | 'total' | 'accuracy' | 'successful' = 'value'): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const o = v as AnyObj;
    if (key === 'accuracy') return Number(o.accuracy ?? 0);
    if (key === 'total')    return Number(o.total ?? o.value ?? 0);
    if (key === 'successful') return Number(o.successful ?? o.value ?? 0);
    return Number(o.value ?? o.successful ?? o.total ?? 0);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'number') return v === 0;
  if (typeof v === 'object') {
    const o = v as AnyObj;
    const total = Number(o.total ?? 0);
    const value = Number(o.value ?? 0);
    const succ  = Number(o.successful ?? 0);
    return total === 0 && value === 0 && succ === 0;
  }
  return false;
}

function fmtInt(v: unknown): string {
  const n = num(v);
  return Number.isFinite(n) && n !== 0 ? Math.round(n).toLocaleString('ru-RU') : '—';
}

function fmtDistance(v: unknown): string {
  const n = num(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${(n / 1000).toFixed(2)} км`;
}

/** Compound: "5/4 (80%)" — total/successful (accuracy%) */
function fmtCompound(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') return v === 0 ? '—' : v.toLocaleString('ru-RU');
  if (typeof v === 'object') {
    const o = v as AnyObj;
    const total = o.total != null ? Number(o.total) : null;
    const succ  = o.successful != null ? Number(o.successful) : (o.value != null ? Number(o.value) : null);
    const acc   = o.accuracy != null ? Number(o.accuracy) : null;
    if (total != null && succ != null) {
      return acc != null && total > 0
        ? `${succ}/${total} · ${acc}%`
        : `${succ}/${total}`;
    }
    if (succ != null) return succ === 0 ? '—' : succ.toLocaleString('ru-RU');
  }
  return '—';
}

/** Универсал для произвольного поля внутри группы — определяет compound автоматически */
function formatValue(v: unknown, key: string): string {
  // Distance fields → km
  if (/distance/i.test(key)) return fmtDistance(v);
  if (/averageSpeed/i.test(key)) {
    const n = num(v);
    return Number.isFinite(n) && n > 0 ? `${n.toFixed(2)} м/с` : '—';
  }
  // Compound objects → "5/4 · 80%"
  if (v && typeof v === 'object') return fmtCompound(v);
  // Simple numbers
  return fmtInt(v);
}

function formatNum(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'object') v = v.value ?? v.pct ?? v.successful ?? null;
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString('ru-RU');
  return n.toFixed(n < 10 ? 2 : 0);
}

function formatBadge(label: string, v: number): string {
  if (label === 'Дистанция') return `${(v / 1000).toFixed(1)} км`;
  if (label === 'Точность пас') return `${v.toFixed(0)}%`;
  if (label === 'Рейтинг')   return v.toFixed(1);
  if (Number.isInteger(v))   return v.toString();
  return v.toFixed(2);
}

function humanize(k: string): string {
  return k
    .replace(/([a-z])([A-Z])/g, '$1 $2')
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

function ratingTextColor(r: number): string {
  if (r >= 8.5) return '#22c55e';
  if (r >= 7)   return '#84cc16';
  if (r >= 5.5) return '#facc15';
  return '#f97316';
}

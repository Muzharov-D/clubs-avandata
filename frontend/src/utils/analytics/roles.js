/**
 * Role-fit движок: классификация игрока к лучшему позиционному архетипу по
 * профилю метрик (косинусная близость к эталонному весовому вектору архетипа).
 * Признаки масштабируются внутри состава (0–1), чтобы сравнение было честным.
 */
import { M } from './metrics';
import { playerXa, playerThreat } from './progression';

// Признаки игрока (сырьё; масштабируем по составу ниже).
function features(p) {
  return {
    finishing: M.goals(p) * 2 + M.shots(p),
    creativity: M.keyPass(p) + M.assists(p) * 2 + playerXa(p) * 5,
    progression: M.progressivePass(p) + M.progressiveRun(p) + M.passToFinalThird(p) + playerThreat(p) * 3,
    dribbling: M.dribble(p) + M.progressiveRun(p),
    aerial: M.aerialDuel(p),
    tackling: M.tackle(p) + M.interception(p),
    recovery: M.recovery(p) + M.clearance(p) + M.blockedShot(p),
    pressing: M.pressing(p) + M.counterpressing(p),
    distribution: M.pass(p) + M.passForward(p),
    workrate: M.hsr(p) + M.sprintDistance(p),
  };
}

const KEYS = ['finishing', 'creativity', 'progression', 'dribbling', 'aerial', 'tackling', 'recovery', 'pressing', 'distribution', 'workrate'];

const ARCHETYPES = {
  'Бомбардир': { finishing: 1, creativity: 0.3, dribbling: 0.4, aerial: 0.4, progression: 0.2 },
  'Вингер / инсайд': { dribbling: 1, creativity: 0.7, finishing: 0.6, progression: 0.5, workrate: 0.5 },
  'Плеймейкер «10»': { creativity: 1, progression: 0.8, distribution: 0.6, dribbling: 0.4 },
  'Box-to-box': { workrate: 1, progression: 0.7, pressing: 0.7, tackling: 0.6, creativity: 0.4 },
  'Опорник-разрушитель': { tackling: 1, recovery: 0.8, pressing: 0.7, aerial: 0.5, distribution: 0.5 },
  'Распасовщик (DLP)': { distribution: 1, progression: 0.8, creativity: 0.5, tackling: 0.3 },
  'Атакующий фулбэк': { workrate: 0.9, progression: 0.6, dribbling: 0.6, tackling: 0.6, creativity: 0.5 },
  'Центральный защитник': { recovery: 1, aerial: 0.9, tackling: 0.8, distribution: 0.5 },
};

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of KEYS) {
    const x = a[k] || 0;
    const y = b[k] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * roleFit(player, squad) → { best: {role, fit}, ranked: [{role, fit}] }.
 * fit — 0..100 (косинус×100). Вратаря не классифицируем (отдельный профиль).
 */
export function roleFit(player, squad) {
  const pool = (squad || []).filter((p) => Number(p?.minutes ?? 0) > 0);
  if (!pool.length) return { best: null, ranked: [] };
  // Масштаб по максимуму состава для каждого признака.
  const max = {};
  for (const k of KEYS) max[k] = 0;
  const feats = pool.map((p) => ({ id: p.id, f: features(p) }));
  for (const { f } of feats) for (const k of KEYS) if (f[k] > max[k]) max[k] = f[k];

  const raw = features(player);
  const scaled = {};
  for (const k of KEYS) scaled[k] = max[k] > 0 ? raw[k] / max[k] : 0;

  const ranked = Object.entries(ARCHETYPES)
    .map(([role, w]) => ({ role, fit: Math.round(cosine(scaled, w) * 100) }))
    .sort((a, b) => b.fit - a.fit);

  return { best: ranked[0] || null, ranked };
}

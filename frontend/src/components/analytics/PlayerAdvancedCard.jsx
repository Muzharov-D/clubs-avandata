/**
 * Продвинутые модельные метрики игрока за матч: xG-модель, xT/угроза + доля
 * вклада, xA-прокси, packing, креативность, G+A/90, PAdj-оборона/90, win% дуэлей.
 * Покрывает критики 3/24, улучшения 40/64/65, вау 67/68/69/80/84/98.
 *
 * Всё, что модельное, помечено тегом. Per-90 — по умолчанию (тоггл на Σ).
 */
import { useState } from 'react';
import { num } from '../../utils/num';
import {
  M, played, ourSideKey, teamXg, playerXgModel,
  playerThreat, threatShare, playerXa, playerPacking, creativityIndex,
  padjWorkload, duelWinPct, aerialWinPct, per90, fmtPer90,
} from '../../utils/analytics';
import './analytics.css';

function f0(v) { return v == null ? '—' : Math.round(Number(v)).toLocaleString('ru-RU'); }

export default function PlayerAdvancedCard({ player, squad, match }) {
  const [per90Mode, setPer90Mode] = useState(true);
  if (!player || !played(player)) return null;

  const { our } = ourSideKey(match || {});
  const teamXgVal = teamXg(match || {}, our);
  const ourPoss = num(match?.teamSummaryStats?.[our]?.possessionPct) ?? 50;
  const minutes = player.minutes;

  const xgMap = playerXgModel((squad || []).filter(played), teamXgVal);
  const xg = xgMap.get(player.id)?.xg ?? 0;
  const xgCalibrated = xgMap.get(player.id)?.calibrated ?? false;

  const tShare = threatShare(player, (squad || []).filter(played));
  const dWin = duelWinPct(player);
  const aWin = aerialWinPct(player);

  // value: для счётных — per-90 при включённом режиме (и достаточных минутах).
  const show = (raw, digits = 2) => {
    if (per90Mode) {
      const p = per90(raw, minutes);
      return p == null ? `${fmtPer90(raw)}*` : fmtPer90(p);
    }
    return digits === 0 ? f0(raw) : fmtPer90(raw);
  };

  const tiles = [
    { label: 'Гол+пас', model: false, val: show(M.goalContrib(player), 0), sub: 'результативность' },
    { label: 'xG', model: true, val: show(xg), sub: xgCalibrated ? 'калибр. к командному xG' : 'оценка по ударам' },
    { label: 'xA', model: true, val: show(playerXa(player)), sub: 'ожидаемые ассисты (прокси)' },
    { label: 'Угроза xT', model: true, val: show(playerThreat(player)), sub: tShare != null ? `${Math.round(tShare * 100)}% угрозы команды` : 'добавленная угроза' },
    { label: 'Креативность', model: true, val: show(creativityIndex(player)), sub: 'созидание (индекс)' },
    { label: 'Packing', model: true, val: show(playerPacking(player), 0), sub: 'продвижение сквозь линии' },
    { label: 'Оборона PAdj', model: true, val: show(padjWorkload(player, ourPoss), 0), sub: 'с поправкой на владение' },
  ];
  if (dWin != null) tiles.push({ label: 'Дуэли %', model: false, val: `${dWin}%`, sub: aWin != null ? `верх ${aWin}%` : 'выиграно' });

  return (
    <div className="card an">
      <div className="an-xg__head" style={{ marginBottom: 10 }}>
        <div className="page-section-title" style={{ margin: 0 }}>Продвинутые метрики <span className="an-model-tag">модель</span></div>
        <div className="an-toggle" role="group" aria-label="Режим значений">
          <button className={`an-toggle__btn${!per90Mode ? ' is-active' : ''}`} onClick={() => setPer90Mode(false)}>Σ</button>
          <button className={`an-toggle__btn${per90Mode ? ' is-active' : ''}`} onClick={() => setPer90Mode(true)}>на 90′</button>
        </div>
      </div>
      <div className="an-metrics__grid">
        {tiles.map((t) => (
          <div className="an-metric" key={t.label}>
            <div className="an-metric__val">{t.val}</div>
            <div className="an-metric__label">{t.label}{t.model && <span className="an-model-tag">модель</span>}</div>
            <div className="an-metric__sub">{t.sub}</div>
          </div>
        ))}
      </div>
      <div className="an-note">
        xG — командный xG из отчёта, распределённый по миксу ударов игрока. xT/xA/
        packing/креативность — прозрачные модели на реальных событиях продвижения.
        {per90Mode && ' Значения на 90 минут; «*» — мало минут, показано сырое.'}
      </div>
    </div>
  );
}

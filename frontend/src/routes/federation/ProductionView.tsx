import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { FedError, FedEmpty } from './FedState';
import './avandata.css';

/**
 * «Производство талантов» — квадрант-скаттер клубов: X = сколько топ-игроков клуб
 * дал (топ-22 по рейтингу когорты, разбор AvanData), Y = его результат (очки за игру).
 * Отвечает на «Победа ≠ производство таланта»: клуб может побеждать без топ-индивидов
 * (Зенит ~0 / PPG ~2.1) или растить таланты и проигрывать (ФК Динамо ~7 / ~0.6).
 * Источник — /federation/av/talent-production (живой расчёт по back.avandata.ru + ФФСПб).
 */

interface ProdClub { name: string; logo: string | null; talents: number; ppg: number; cohorts: number; }
interface Payload { clubs: ProdClub[]; medianTalents: number; medianPpg: number; }

// Геометрия графика (в %): поле для точек внутри отступов под оси/подписи.
const PAD = { l: 9, r: 5, t: 6, b: 11 } as const; // отступы поля в % контейнера
const Y_MAX = 3; // PPG-шкала 0..3

const plClub = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'клубов'; if (b === 1) return 'клуб'; if (b >= 2 && b <= 4) return 'клуба'; return 'клубов'; };

export function FederationProduction() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['av', 'talent-production'],
    queryFn: () => api<Payload>('/federation/av/talent-production'),
  });

  const clubs = data?.clubs ?? [];
  const maxTalents = useMemo(() => Math.max(4, ...clubs.map((c) => c.talents)), [clubs]);
  const [peek, setPeek] = useState<ProdClub | null>(null);

  // Позиция точки в % контейнера: X ∝ talents/maxTalents, Y ∝ ppg/Y_MAX (инвертируем — верх = высокий PPG).
  const xPct = (talents: number) => PAD.l + (talents / maxTalents) * (100 - PAD.l - PAD.r);
  const yPct = (ppg: number) => PAD.t + (1 - Math.min(ppg, Y_MAX) / Y_MAX) * (100 - PAD.t - PAD.b);

  const medX = data ? xPct(data.medianTalents) : 50;
  const medY = data ? yPct(data.medianPpg) : 50;

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Производство талантов</h1>
          <p className="av-sub">Топ-игроки клуба × результат · по разбору AvanData</p>
        </div>
      </header>

      {error && <FedError />}

      <section className="av-surface av-surface--feature av-pad-lg av-rise">
        {isLoading ? (
          <div className="av-skeleton" style={{ aspectRatio: '7 / 5' }} />
        ) : clubs.length === 0 ? (
          <FedEmpty>Мало разобранных когорт для карты производства талантов.</FedEmpty>
        ) : (
          <>
            <div className="av-section" style={{ marginBottom: 12 }}>
              <div>
                <h2 className="av-section-title">Производство × результат</h2>
                <p className="av-section-sub">
                  {clubs.length} {plClub(clubs.length)} · крестовина — медианы (талантов {data!.medianTalents}, PPG {data!.medianPpg}) · клик по гербу — детали
                </p>
              </div>
            </div>

            <div style={{ position: 'relative', width: '100%', aspectRatio: '7 / 5' }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden>
                {/* Тинты квадрантов: верх-право (производят и побеждают) — зелёный, низ-право (производят, не побеждают) — янтарь. */}
                <rect x={medX} y={PAD.t} width={100 - PAD.r - medX} height={medY - PAD.t} fill="var(--av-success)" opacity="0.06" />
                <rect x={PAD.l} y={PAD.t} width={medX - PAD.l} height={medY - PAD.t} fill="var(--av-accent)" opacity="0.05" />
                <rect x={medX} y={medY} width={100 - PAD.r - medX} height={100 - PAD.b - medY} fill="var(--av-warning)" opacity="0.06" />
                <rect x={PAD.l} y={medY} width={medX - PAD.l} height={100 - PAD.b - medY} fill="var(--av-text-dim)" opacity="0.04" />

                {/* Рамка поля */}
                <rect x={PAD.l} y={PAD.t} width={100 - PAD.l - PAD.r} height={100 - PAD.t - PAD.b} fill="none" stroke="var(--av-border)" strokeWidth="0.3" />

                {/* Крестовина медиан */}
                <line x1={medX} y1={PAD.t} x2={medX} y2={100 - PAD.b} stroke="var(--av-text-dim)" strokeWidth="0.35" strokeDasharray="1.4 1.4" opacity="0.7" />
                <line x1={PAD.l} y1={medY} x2={100 - PAD.r} y2={medY} stroke="var(--av-text-dim)" strokeWidth="0.35" strokeDasharray="1.4 1.4" opacity="0.7" />
              </svg>

              {/* Угловые подписи зон — HTML поверх SVG (чёткий текст без растяжения preserveAspectRatio). */}
              <ZoneLabel text="Производят и побеждают" color="var(--av-success)" style={{ right: '6%', top: '7%', textAlign: 'right' }} />
              <ZoneLabel text="Побеждают без производства" color="var(--av-accent)" style={{ left: '10%', top: '7%' }} />
              <ZoneLabel text="Производят, не побеждают" color="var(--av-warning)" style={{ right: '6%', bottom: '13%', textAlign: 'right' }} />
              <ZoneLabel text="ни то, ни то" color="var(--av-text-dim)" style={{ left: '10%', bottom: '13%' }} />

              {/* Подписи осей */}
              <span style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--av-text-dim)' }}>
                Топ-игроков (0–{maxTalents})
              </span>
              <span style={{ position: 'absolute', left: 2, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', transformOrigin: 'left center', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--av-text-dim)', whiteSpace: 'nowrap' }}>
                Очки за игру (0–{Y_MAX})
              </span>

              {/* Узлы клубов — герб в круге поверх SVG (как слоты сборной над полем). */}
              {clubs.map((c) => (
                <button
                  key={c.name} type="button" className="av-prodnode"
                  style={{ left: `${xPct(c.talents)}%`, top: `${yPct(c.ppg)}%` }}
                  title={`${c.name} · ${c.talents} топ-игроков · PPG ${c.ppg}`}
                  onClick={() => setPeek(c)}
                >
                  {c.logo ? (
                    <ClubShield name={c.name} logoUrl={c.logo} size={30} />
                  ) : (
                    <span className="av-prodnode__dot" style={{ background: 'var(--av-accent)' }} aria-hidden />
                  )}
                </button>
              ))}
            </div>

            <p className="av-cap" style={{ marginTop: 14 }}>
              Топ = топ-22 по рейтингу когорты. В один сезон талант и победа частично связаны — говорящие
              именно отклонения (произвёл много и проиграл / победил без топов).
            </p>
          </>
        )}
      </section>

      {peek && <ProdPeek c={peek} onClose={() => setPeek(null)} />}
    </>
  );
}

function ZoneLabel({ text, color, style }: { text: string; color: string; style: React.CSSProperties }) {
  return (
    <span
      style={{
        position: 'absolute', maxWidth: '34%', fontSize: 10.5, fontWeight: 700, lineHeight: 1.3,
        letterSpacing: '0.02em', textTransform: 'uppercase', color, opacity: 0.85, pointerEvents: 'none', ...style,
      }}
    >
      {text}
    </span>
  );
}

/** Карточка клуба из карты — по клику на герб, без ухода со страницы. */
function ProdPeek({ c, onClose }: { c: ProdClub; onClose: () => void }) {
  const plYear = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'когорт'; if (b === 1) return 'когорту'; if (b >= 2 && b <= 4) return 'когорты'; return 'когорт'; };
  return (
    <div className="av-modal__backdrop" onClick={onClose} role="presentation">
      <div className="av-peek" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={c.name}>
        <button type="button" className="av-modal__close" onClick={onClose} aria-label="Закрыть">✕</button>
        <div className="av-peek__head">
          <ClubShield name={c.name} logoUrl={c.logo} size={56} />
          <div style={{ minWidth: 0 }}>
            <div className="av-peek__name">{c.name}</div>
            <div className="av-peek__meta">{c.talents} топ-игроков · по {c.cohorts} {plYear(c.cohorts)}</div>
          </div>
          <span className="av-peek__rate" style={{ color: 'var(--av-accent)' }}>{c.ppg}</span>
        </div>
        <div className="av-peek__foot">
          <span className="av-peek__mp">очки за игру (PPG) · среднее по когортам</span>
        </div>
      </div>
    </div>
  );
}

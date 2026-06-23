import { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PlayerAvatar } from './PlayerAvatar';
import { ClubShield } from './ClubShield';
import { FedError, FedEmpty } from './FedState';
import { ratingLabel, rating10Color } from './ratings';
import { useFedYear, fedQ } from './avYear';
import { lastName, plMatch } from './utils';
import './federation.css';

type Line = 'GK' | 'DEF' | 'MID' | 'FWD';
interface XiPlayer {
  id: number; name: string; club: string | null; clubLogo: string | null; photo: string | null;
  line: Line; position: string | null; rating: number | null; mp: number; pct: number;
  year?: number; // присваивается только при сборке совокупной XI (когорта, из которой взят игрок)
}
interface Cohort { year: number; ratedCount: number; clubs: number; xi: XiPlayer[]; }

const LINE_TAG: Record<Line, string> = { GK: 'ВРТ', DEF: 'ЗАЩ', MID: 'ПЗ', FWD: 'НАП' };
// Линии разнесены равномерно по высоте (~24% между рядами) и сдвинуты вверх, чтобы
// карточка вратаря (аватар + имя + клуб + рейтинг) ЦЕЛИКОМ влезала над нижним краем поля
// (overflow:hidden иначе подрезал год/рейтинг ВРТ), а ряды не налезали друг на друга.
const SLOTS: Record<Line, Array<{ l: number; t: number }>> = {
  GK: [{ l: 50, t: 85 }],
  DEF: [{ l: 9, t: 61 }, { l: 37, t: 63 }, { l: 63, t: 63 }, { l: 91, t: 61 }],
  MID: [{ l: 17, t: 38 }, { l: 50, t: 36 }, { l: 83, t: 38 }],
  FWD: [{ l: 17, t: 14 }, { l: 50, t: 13 }, { l: 83, t: 14 }],
};
const LINE_ORDER: Line[] = ['GK', 'DEF', 'MID', 'FWD'];
// Родительный падеж лиги для подписи «Сборная … лиги».
const DIV_GEN: Record<string, string> = { 'Высшая': 'Высшей', 'Первая': 'Первой' };
const pctRing = (pct: number): string =>
  pct >= 97 ? 'var(--success)' : pct >= 93 ? 'var(--accent)' : 'var(--text-secondary)';

export function BestXiBody() {
  const { year: globalYear, division } = useFedYear();
  const { data, isLoading, error } = useQuery({
    queryKey: ['av', 'best-xi', division],
    // year не шлём: эндпоинт всегда отдаёт все когорты, год выбирается на клиенте; division
    // фильтрует игроков по лиге на бэке → сборная Высшей/Первой отдельно.
    queryFn: () => api<{ cohorts: Cohort[] }>(`/federation/av/best-xi${fedQ(null, division)}`),
  });
  const cohorts = useMemo(() => (data?.cohorts ?? []).slice().sort((a, b) => b.year - a.year), [data]);
  const [peek, setPeek] = useState<XiPlayer | null>(null);

  // «Все» (globalYear == null) → СОВОКУПНАЯ сборная региона: объединяем xi всех когорт
  // (каждый — топ-по-линии своей когорты, значит в союзе лежат сильнейшие региона по линии),
  // помечаем каждого годом его когорты, и в каждой линии берём top-N по АБСОЛЮТНОМУ рейтингу
  // (число слотов = SLOTS[line].length → 1 ВРТ / 4 ЗАЩ / 3 ПЗ / 3 НАП = 11).
  const unionXi = useMemo<XiPlayer[]>(() => {
    if (cohorts.length === 0) return [];
    const byLine: Record<Line, XiPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const cohort of cohorts) {
      for (const p of cohort.xi) byLine[p.line].push({ ...p, year: cohort.year });
    }
    const out: XiPlayer[] = [];
    for (const line of LINE_ORDER) {
      const top = byLine[line]
        .slice()
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, SLOTS[line].length);
      out.push(...top);
    }
    return out;
  }, [cohorts]);

  const isUnion = globalYear == null && cohorts.length > 0;
  const cohort = globalYear != null ? cohorts.find((c) => c.year === globalYear) ?? null : null;
  // xi для отрисовки: при «Все» — совокупная, иначе — выбранная когорта.
  const activeXi = isUnion ? unionXi : cohort?.xi ?? [];

  const placed = useMemo(() => {
    if (activeXi.length === 0) return [];
    const idx: Record<Line, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const out: Array<{ slot: { l: number; t: number }; player: XiPlayer }> = [];
    for (const line of LINE_ORDER) {
      const inLine = activeXi.filter((p) => p.line === line);
      for (const player of inLine) {
        const slot = SLOTS[line][idx[line]++];
        if (slot) out.push({ slot, player });
      }
    }
    return out;
  }, [activeXi]);

  // Поле заполняет всю половину (ширину И высоту). ВЫСОТА — узкое место (4 линии в стопке),
  // поэтому игроков масштабируем по высоте поля (ph): на коротком окне поле ниже → игроки
  // мельче → ряды не налезают; на высоком — крупнее. ph меряем ResizeObserver-ом; дефолт 340
  // близок к типовому, чтобы первый кадр был корректным до срабатывания обсервера.
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const [ph, setPh] = useState(340);
  useEffect(() => {
    const el = pitchRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 0) setPh(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeXi.length]);
  const u = ph / 100;                                 // 1% высоты поля
  const r = (k: number) => Math.round(k * u);
  // Карточка игрока = аватар + 3 строки (Фамилия / Рейтинг / лого клуба). Высота должна
  // влезать 4 рядами в высоту поля: 4 ряда × ~24% = 96% диапазона, карточка ≤ ~22% высоты,
  // иначе ряды/края подрезаются. Аватар чуть меньше (r8), чтобы 3-я строка не распёрла карточку.
  const avSize = Math.min(54, Math.max(20, r(8)));    // ~26px при ph≈330, растёт с высотой окна
  const nameFont = Math.max(9, r(2.7));
  const ratingFont = Math.max(10, r(3.1));            // рейтинг — заметнее (ключевая метрика)
  const logoSize = Math.max(15, r(4.2));              // герб — отдельной строкой, крупнее
  const colGap = Math.max(2, r(0.8));
  const chipPadV = Math.max(1, r(0.45));
  const chipPadH = Math.max(4, r(1.7));

  return (
    <>
      {error && <FedError />}

      <div className="fed-card fed-xi-card" style={{ position: 'relative', overflow: 'hidden' }}>
        {isLoading ? (
          <div className="fed-skeleton" style={{ flex: 1, minHeight: 0 }} />
        ) : activeXi.length === 0 ? (
          <FedEmpty>Недостаточно разобранных игроков для формирования сборной.</FedEmpty>
        ) : (
          <>
            <div style={{ marginBottom: 12, flex: 'none' }}>
              <h3 style={{ fontSize: 18, fontWeight: 400, margin: 0 }}>
                {isUnion ? `Сборная ${DIV_GEN[division] ?? division} лиги · все возрасты` : `Сборная ${DIV_GEN[division] ?? division} лиги · ${cohort!.year} года рождения`}
              </h3>
            </div>

            {/* Питч заполняет левую половину: обёртка flex:1 центрирует поле по горизонтали,
                само поле height-driven (height:100% + aspect-ratio 4/5), max-width:100% чтобы
                не вылезать за узкую ячейку. Доминирующий элемент колонки. */}
            <div className="fed-xi-pitch-wrap">
            <div ref={pitchRef} className="fed-xi-pitch" style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'linear-gradient(180deg, #1a4a2a, #0e3d1f)' }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
                <rect x="0" y="0" width="100" height="100" fill="url(#grass)" />
                <defs>
                  <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a4a2a" /><stop offset="50%" stopColor="#0e3d1f" /><stop offset="100%" stopColor="#1a4a2a" />
                  </linearGradient>
                </defs>
                {[0,1,2,3,4,5,6,7,8,9].map((i) => <rect key={i} x="0" y={i*10} width="100" height="10" fill={i%2 ? 'rgba(255,255,255,0.03)' : 'transparent'} />)}
                <g fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4">
                  <rect x="2" y="2" width="96" height="96" />
                  <line x1="2" y1="50" x2="98" y2="50" />
                  <circle cx="50" cy="50" r="9" />
                  <rect x="24" y="2" width="52" height="14" />
                  <rect x="38" y="2" width="24" height="5.5" />
                  <rect x="24" y="84" width="52" height="14" />
                  <rect x="38" y="92.5" width="24" height="5.5" />
                </g>
              </svg>

              {placed.map(({ slot, player }) => {
                // Обводка аватара: в совокупной сборной (игроки из разных когорт) перцентиль
                // не имеет смысла → нейтраль; в когортной — по перцентилю линии.
                // Подпись = 3 строки под аватаром: Фамилия / Рейтинг / лого клуба.
                const ring = isUnion ? 'var(--text-secondary)' : pctRing(player.pct);
                const title = isUnion
                  ? `${player.name}${player.club ? ` · ${player.club}` : ''} · ${LINE_TAG[player.line]}${player.year ? ` · ${player.year} г.р.` : ''}`
                  : `${player.name}${player.club ? ` · ${player.club}` : ''} · ${LINE_TAG[player.line]} · топ ${player.pct}% линии`;
                return (
                  <button
                    key={player.id} type="button"
                    style={{ position: 'absolute', left: `${slot.l}%`, top: `${slot.t}%`, transform: 'translate(-50%, -50%)', zIndex: 2, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: colGap }}
                    title={title}
                    onClick={() => setPeek(player)}
                  >
                    <span style={{ borderRadius: '50%', boxShadow: `0 0 0 2px ${ring}, 0 3px 7px rgba(0,0,0,0.55)`, display: 'block' }}>
                      <PlayerAvatar name={player.name} photoUrl={player.photo} size={avSize} ring={player.line === 'GK'} />
                    </span>
                    {/* Строка 1 — Фамилия */}
                    <span style={{ fontSize: nameFont, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: `${chipPadV}px ${chipPadH}px`, borderRadius: 6, whiteSpace: 'nowrap', lineHeight: 1.15 }}>{lastName(player.name)}</span>
                    {/* Строка 2 — Рейтинг (ключевая метрика, заметным цветом по шкале) */}
                    <span style={{ fontSize: ratingFont, fontWeight: 800, color: rating10Color(player.rating), background: 'rgba(8,12,20,0.92)', padding: `${chipPadV}px ${chipPadH}px`, borderRadius: 6, lineHeight: 1, fontVariantNumeric: 'tabular-nums', border: '1px solid rgba(255,255,255,0.12)' }}>{ratingLabel(player.rating)}</span>
                    {/* Строка 3 — лого клуба */}
                    <ClubShield name={player.club ?? player.name} logoUrl={player.clubLogo} size={logoSize} />
                  </button>
                );
              })}
            </div>
            </div>
          </>
        )}
      </div>

      {peek && <XiPeek p={peek} onClose={() => setPeek(null)} />}
    </>
  );
}

function XiPeek({ p, onClose }: { p: XiPlayer; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 32, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }} onClick={onClose} role="presentation">
      <div className="fed-card" style={{ width: '100%', maxWidth: 400, position: 'relative', marginTop: 56 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={p.name}>
        <button type="button" onClick={onClose} aria-label="Закрыть" style={{ position: 'absolute', top: 12, right: 14, width: 30, height: 30, borderRadius: 8, fontSize: 18, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <PlayerAvatar name={p.name} photoUrl={p.photo} size={66} ring />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
            <div className="fed-note">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.year ? ` · ${p.year} г.р.` : ` · топ ${p.pct}%`}</div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 24, fontWeight: 700, color: rating10Color(p.rating) }}>{ratingLabel(p.rating)}</span>
        </div>
        <div className="fed-note">{p.mp ? `Средний рейтинг за ${p.mp} ${plMatch(p.mp)}` : 'Средний рейтинг по матчам'}</div>
      </div>
    </div>
  );
}

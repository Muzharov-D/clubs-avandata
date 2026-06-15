import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { FedRadar, type RadarAxis } from './FedRadar';
import { ratingColor } from './fedColors';
import './federation.css';

interface Overview { clubs: { total: number; paid: number; free: number }; teams: number; players: number; matches: number }
interface AgeEffect { region: { q1: number; q2: number; q3: number; q4: number; total: number }; clubs: Array<{ slug: string; name: string; total: number; q1Pct: number | null }> }
interface DevRow { slug: string; name: string; activePlayers: number; totalMinutes: number; youngPct: number | null }
interface TalentRow { playerId: string; name: string | null; club: string; ageGroup: string; position: string | null; rating: number | null }
interface RegionProfile { ratings: { overall: number | null; attack: number | null; defence: number | null; passing: number | null; fitness: number | null; creativity: number | null }; matchesRated: number }

const Q_LABELS = ['Q1 · янв–мар', 'Q2 · апр–июн', 'Q3 · июл–сен', 'Q4 · окт–дек'];

/**
 * «Открытия региона» — лендинг кабинета федерации. Не витрина метрик, а телескоп:
 * каждая находка показывает то, что невидимо отдельному клубу и проявляется только
 * на данных всего региона. Вердикт-заголовок → улика → почему это видно только тут.
 * Данные из существующих эндпоинтов (age-effect, development, talent, region-profile).
 */
export function FederationDiscoveries() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const ov = useQuery({ queryKey: ['federation', 'overview'], queryFn: () => api<Overview>('/federation/overview') });
  const ae = useQuery({ queryKey: ['federation', 'age-effect'], queryFn: () => api<AgeEffect>('/federation/age-effect') });
  const dev = useQuery({ queryKey: ['federation', 'development'], queryFn: () => api<{ clubs: DevRow[] }>('/federation/development') });
  const tal = useQuery({ queryKey: ['federation', 'talent', 0], queryFn: () => api<{ players: TalentRow[] }>('/federation/talent?minMinutes=0') });
  const rp = useQuery({ queryKey: ['federation', 'region-profile'], queryFn: () => api<RegionProfile>('/federation/region-profile') });

  const clubsTotal = ov.data?.clubs.total ?? 0;
  const loading = ov.isLoading || ae.isLoading || dev.isLoading || tal.isLoading || rp.isLoading;

  return (
    <div>
      <header className="fed-head">
        <div>
          <h1 className="fed-title">Открытия региона</h1>
          <p className="fed-sub">{federation?.region ?? federation?.name ?? 'Регион'} · что видно только на данных всего региона — и невидимо отдельному клубу</p>
        </div>
      </header>

      {loading && (
        <div className="fed-findings">{[0, 1, 2, 3].map((i) => <div key={i} className="fed-skeleton" style={{ height: i === 0 ? 200 : 150 }} />)}</div>
      )}

      {!loading && (
        <div className="fed-findings">
          <AgeLeakFinding data={ae.data} />
          <DevelopFinding clubs={dev.data?.clubs} clubsTotal={clubsTotal} />
          <HiddenMiddleFinding players={tal.data?.players} clubsTotal={clubsTotal} />
          <StyleDnaFinding rp={rp.data} clubsTotal={clubsTotal} />

          <p className="fed-faint" style={{ fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>
            Каркас «Открытий» построен на данных {clubsTotal === 1 ? 'одного клуба' : `${clubsTotal} клубов`} — на малой выборке узор тонкий
            и обостряется с каждым новым клубом региона. Сырые цифры и охват — во вкладке{' '}
            <Link to="/federation/summary" className="fed-link">Сводка</Link>.
          </p>
        </div>
      )}
    </div>
  );
}

function Finding({ kicker, hero, verdict, why, children, to, cta }: {
  kicker: string; hero?: boolean; verdict: string; why: string; children?: ReactNode; to: string; cta: string;
}) {
  return (
    <section className={`fed-finding fed-rise${hero ? ' fed-finding--hero' : ''}`}>
      <div className="fed-finding__kicker">{kicker}</div>
      <h2 className="fed-finding__verdict">{verdict}</h2>
      <p className="fed-finding__why">{why}</p>
      {children && <div className="fed-finding__body">{children}</div>}
      <div className="fed-finding__foot"><Link to={to} className="fed-link">{cta} →</Link></div>
    </section>
  );
}

function AgeLeakFinding({ data }: { data?: AgeEffect }) {
  const r = data?.region;
  const total = r?.total ?? 0;
  if (!r || total === 0) {
    return <Finding kicker="⏳ Открытие 1 · Возрастная утечка" hero verdict="Нет дат рождения для анализа отбора" why="Как только у игроков появятся даты рождения, регион увидит возрастной перекос отбора." to="/federation/age-effect" cta="Возрастной эффект" />;
  }
  const q = [r.q1, r.q2, r.q3, r.q4];
  const pct = q.map((n) => Math.round((n / total) * 100));
  const late = r.q3 + r.q4;
  const latePct = Math.round((late / total) * 100);
  const deficit = Math.round(total * 0.5 - late);
  const verdict = latePct < 46
    ? `Регион недобирает поздно рождённых: вторая половина года — ${latePct}% состава вместо ~50%.`
    : latePct > 54
      ? `Необычно: поздно рождённых даже больше нормы — ${latePct}% против ~50%.`
      : `Возрастной отбор пока ровный: вторая половина года — ${latePct}%.`;
  return (
    <Finding
      kicker="⏳ Открытие 1 · Возрастная утечка"
      hero
      verdict={verdict}
      why={`Каждый клуб уверен, что берёт лучших. Но в 11–12 лет рождённые в начале года крупнее и сильнее — их и отбирают, путая зрелость с талантом.${deficit > 0 ? ` Это ≈${deficit} мест, ушедших старшим внутри возраста.` : ''} Перекос виден только на распределении дней рождения по всему региону.`}
      to="/federation/age-effect"
      cta="Разобрать возрастной эффект"
    >
      <div>
        {q.map((n, i) => (
          <div key={i} className="fed-dist__row">
            <span className="fed-dist__label">{Q_LABELS[i]}</span>
            <span className="fed-dist__track">
              <span className="fed-dist__fill" style={{ width: `${pct[i]}%` }} />
              <span className="fed-dist__ref" />
            </span>
            <span className="fed-dist__val">{pct[i]}% · {n}</span>
          </div>
        ))}
        <div className="fed-faint" style={{ fontSize: 11, marginTop: 4 }}>Линия — равномерное ожидание 25% на квартал · всего {total} игроков с датой рождения</div>
      </div>
    </Finding>
  );
}

function DevelopFinding({ clubs, clubsTotal }: { clubs?: DevRow[]; clubsTotal: number }) {
  const list = (clubs ?? []).filter((c) => c.totalMinutes > 0).sort((a, b) => (b.youngPct ?? 0) - (a.youngPct ?? 0));
  if (list.length === 0) {
    return <Finding kicker="⚖️ Открытие 2 · Победа ≠ развитие" verdict="Нет данных о минутах для оценки развития" why="Связка «место в таблице × минуты молодым» оживёт, когда появятся разобранные матчи с минутами." to="/federation/development" cta="Развитие и продуктивность" />;
  }
  const top = list[0];
  const bottom = list[list.length - 1];
  const verdict = list.length >= 2
    ? `Развитие не равно таблице: ${top.name} отдаёт молодым ${top.youngPct}% минут, ${bottom.name} — ${bottom.youngPct}%.`
    : `${top.name} отдаёт ${top.youngPct}% минут молодым — играющим на возраст старше.`;
  return (
    <Finding
      kicker="⚖️ Открытие 2 · Победа ≠ развитие"
      verdict={verdict}
      why={list.length >= 2
        ? 'Кто высоко в таблице, но низко здесь — побеждает зрелостью состава, а не растит игроков. Эту связку не видит ни один клуб в отдельности.'
        : 'Минуты молодых — индикатор развития: клуб даёт играть тем, кто моложе номинального возраста команды. Сравнение «побеждает vs растит» оживёт с приходом других клубов.'}
      to="/federation/development"
      cta="Развитие и продуктивность"
    >
      <div>
        {list.slice(0, 3).map((c) => (
          <div key={c.slug} className="fed-row" style={{ padding: '9px 0' }}>
            <span className="fed-row__name" style={{ flex: 1 }}>{c.name}</span>
            <span className="fed-meter" style={{ maxWidth: 140 }}>
              <span className="fed-meter__fill" style={{ width: `${Math.min(c.youngPct ?? 0, 100)}%`, background: 'var(--accent-cyan)' }} />
            </span>
            <span className="fed-num fed-muted" style={{ width: 44, fontSize: 12 }}>{c.youngPct ?? 0}%</span>
          </div>
        ))}
      </div>
    </Finding>
  );
}

function HiddenMiddleFinding({ players, clubsTotal }: { players?: TalentRow[]; clubsTotal: number }) {
  const rated = (players ?? []).filter((p) => p.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  if (rated.length === 0) {
    return <Finding kicker="🔦 Открытие 3 · Невидимая середина" verdict="Нет рейтингов игроков для поиска талантов" why="Сквозной рейтинг по клубам вытащит сильных игроков из слабых команд для сборной региона." to="/federation/leaderboards" cta="Лидерборды" />;
  }
  const verdict = clubsTotal <= 1
    ? 'Пока в регионе один клуб — «невидимая середина» проявится с приходом остальных.'
    : `Сквозной рейтинг по ${clubsTotal} клубам нашёл сильных игроков вне топ-команд — кандидатов в сборную региона.`;
  const top = rated.slice(0, 5);
  return (
    <Finding
      kicker="🔦 Открытие 3 · Невидимая середина"
      verdict={verdict}
      why="Сильный игрок в слабом клубе невидим скауту сборной — клубы не сравнивают себя между собой. Единый рейтинг по всему региону вытаскивает его из тени."
      to="/federation/leaderboards"
      cta="Лидерборды и поиск"
    >
      <div>
        {top.map((p, i) => (
          <Link key={p.playerId} to={`/federation/players/${encodeURIComponent(p.playerId)}`} className="fed-row fed-row--link" style={{ textDecoration: 'none', color: 'inherit', padding: '9px 0', gap: 10 }}>
            <span className="fed-faint fed-num" style={{ width: 18, fontSize: 12 }}>{i + 1}</span>
            <span className="fed-num" style={{ width: 38, fontWeight: 700, color: ratingColor(p.rating), fontSize: 13 }}>{p.rating?.toFixed(1)}</span>
            <span className="fed-row__name" style={{ flex: 1, fontSize: 13.5 }}>
              {p.name ?? <span className="fed-faint" style={{ fontStyle: 'italic' }}>без согласия</span>}
            </span>
            <span className="fed-row__meta" style={{ marginTop: 0 }}>{p.club} · {p.ageGroup}{p.position ? ` · ${p.position}` : ''}</span>
          </Link>
        ))}
      </div>
    </Finding>
  );
}

function StyleDnaFinding({ rp, clubsTotal }: { rp?: RegionProfile; clubsTotal: number }) {
  const rt = rp?.ratings;
  if (!rt || rt.overall == null) {
    return <Finding kicker="🧬 Открытие 4 · ДНК региона" verdict="Нет разобранных матчей для профиля игры" why="Каким футболом играет регион — видно в сумме рейтингов команд по матчам." to="/federation/benchmark" cta="Бенчмаркинг" />;
  }
  const atk = rt.attack ?? 0;
  const def = rt.defence ?? 0;
  const diff = def - atk;
  const verdict = diff >= 0.3
    ? `Регион играет от обороны: оборона ${def.toFixed(1)} против атаки ${atk.toFixed(1)}.`
    : diff <= -0.3
      ? `Регион играет в атаку: атака ${atk.toFixed(1)} против обороны ${def.toFixed(1)}.`
      : `Сбалансированный стиль: атака ${atk.toFixed(1)}, оборона ${def.toFixed(1)}.`;
  const axes = ([
    { label: 'Атака', value: rt.attack },
    { label: 'Оборона', value: rt.defence },
    { label: 'Пас', value: rt.passing },
    { label: 'Физика', value: rt.fitness },
    { label: 'Креатив', value: rt.creativity },
    { label: 'Общий', value: rt.overall },
  ] as RadarAxis[]).filter((a) => a.value != null);
  return (
    <Finding
      kicker="🧬 Открытие 4 · ДНК региона"
      verdict={verdict}
      why={`Каким футболом играет регион в целом и не сходятся ли все школы в одну монокультуру — видно только в сумме по клубам.${clubsTotal <= 1 ? ' Разнообразие школ проявится с ростом числа клубов.' : ''}`}
      to="/federation/benchmark"
      cta="Сравнить клубы"
    >
      {axes.length >= 3 && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <FedRadar data={axes} size={200} />
        </div>
      )}
    </Finding>
  );
}

import { useAuth } from '../../contexts/AuthContext';
import { useFedYear } from './avYear';
import { AgeEffectBody } from './AgeEffectView';
import { PyramidBody } from './PyramidView';
import { BuriedBody } from './BuriedView';
import './federation.css';

/**
 * «Потеря таланта» — единый экран воронки отбора: перекос по когортам
 * (AgeEffectBody, per-cohort) → где скапливаются поздно-рождённые (PyramidBody,
 * по региону) → кого из выживших не выпускают (BuriedBody, по региону).
 * Композиция тел трёх существующих экранов. Когорта: AgeEffect следует
 * глобальному фильтру года; пирамида и минуты пулятся по региону (среза по году
 * в снимке нет) — помечены «по региону» в своих подписях.
 */
export function FederationTalentLoss() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { year } = useFedYear();
  const region = federation?.region ?? federation?.name ?? 'Регион';
  const scope = year != null ? `${year} г.р.` : 'все когорты';

  return (
    <div className="fed-stack">
      <header className="fed-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="fed-title">Потеря таланта</h1>
          <p className="fed-sub">{region} · воронка отбора: перекос по дате рождения → пирамида лиг → игровое время · {scope}</p>
        </div>
      </header>

      {/* 1) Перекос по когортам — per-cohort (следует фильтру года) */}
      <FedSection title="Перекос по когортам" hint="во сколько раз больше рождённых в начале года, чем в конце">
        <AgeEffectBody />
      </FedSection>

      {/* 2) Пирамида лиг — где осели поздно-рождённые (по региону) */}
      <FedSection title="Пирамида лиг" hint="два эшелона · по региону">
        <PyramidBody />
      </FedSection>

      {/* 3) Карта возможностей — кого из выживших не выпускают (по региону) */}
      <FedSection title="Карта возможностей" hint="игровое время · по региону">
        <BuriedBody />
      </FedSection>
    </div>
  );
}

/** Заголовок-разделитель секции внутри длинного экрана (единый ритм fed-*). */
function FedSection({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="fed-head" style={{ marginBottom: 12 }}>
        <div>
          <h2 className="fed-title" style={{ fontSize: 19 }}>{title}</h2>
          <p className="fed-sub">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

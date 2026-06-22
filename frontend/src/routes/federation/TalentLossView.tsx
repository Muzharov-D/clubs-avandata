import { useAuth } from '../../contexts/AuthContext';
import { useFedYear } from './avYear';
import { AgeEffectBody } from './AgeEffectView';
import { PyramidBody } from './PyramidView';
import { BuriedBody } from './BuriedView';
import './federation.css';

export function FederationTalentLoss() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { year } = useFedYear();
  const region = federation?.region ?? federation?.name ?? 'Регион';
  const scope = year != null ? `${year} г.р.` : 'все когорты';

  return (
    <div>
      <div className="fed-hero">
        <div className="fed-hero__kicker">Воронка отбора</div>
        <h1 className="fed-hero__title">Потеря таланта</h1>
        <p className="fed-hero__sub">{region} · перекос по дате рождения → пирамида лиг → игровое время · {scope}</p>
      </div>

      <section style={{ marginBottom: 64 }}>
        <div className="fed-divider" style={{ marginTop: 0 }}>
          <h2 className="fed-divider__title">Перекос по когортам</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>Отношение числа рождённых в начале года к рождённым в конце</p>
        <AgeEffectBody />
      </section>

      <section style={{ marginBottom: 64 }}>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Пирамида лиг</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>Два эшелона · в разрезе региона</p>
        <PyramidBody />
      </section>

      <section>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Карта возможностей</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>Распределение игрового времени · в разрезе региона</p>
        <BuriedBody />
      </section>
    </div>
  );
}

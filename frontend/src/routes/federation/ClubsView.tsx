import { useFedYear } from './avYear';
import { ProductionBody } from './ProductionView';
import { LossMapBody } from './AvLossMap';
import { ClubsBody } from './AvClubs';
import { StandingsBody } from './StandingsBody';
import './federation.css';

export function FederationClubs() {
  const { year, division } = useFedYear();
  const scope = year != null ? `${year} г.р.` : 'все возрасты';

  return (
    <div>
      <div className="fed-hero">
        <div className="fed-hero__kicker">Единица производства</div>
        <h1 className="fed-hero__title">Клубы</h1>
        <p className="fed-hero__sub">Производство, потери и рейтинг школ · {division} лига · {scope}</p>
      </div>

      <section style={{ marginBottom: 64 }}>
        <div className="fed-divider" style={{ marginTop: 0 }}>
          <h2 className="fed-divider__title">Турнирная таблица</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>Официальная картина лиги</p>
        <StandingsBody />
      </section>

      <section style={{ marginBottom: 64 }}>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Производство × результат</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>По региону</p>
        <ProductionBody />
      </section>

      <section style={{ marginBottom: 64 }}>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Карта потерь</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>Потери на этапе отбора и при распределении игрового времени · {scope}</p>
        <LossMapBody />
      </section>

      <section>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Рейтинг и сила клубов</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>Сила лиг, концентрация талантов · {division} лига</p>
        <ClubsBody />
      </section>
    </div>
  );
}

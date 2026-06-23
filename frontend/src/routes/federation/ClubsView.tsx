import { useFedYear } from './avYear';
import { ClubsBody } from './AvClubs';
import { StandingsBody } from './StandingsBody';
import { QualityBody } from './QualityView';
import { LeagueMgmtBody } from './LeaguesView';
import './federation.css';

export function FederationClubs() {
  const { year, division } = useFedYear();
  const scope = year != null ? `${year} г.р.` : 'все возрасты';

  return (
    <div>
      <div className="fed-hero">
        <div className="fed-hero__kicker">Единица производства</div>
        <h1 className="fed-hero__title">Клубы</h1>
        <p className="fed-hero__sub">Таблица, рейтинг и качество игроков школ · {division} лига · {scope}</p>
      </div>

      {/* 1. Турнирная таблица — сортируемая по очкам и по рейтингу AvanData. */}
      <section style={{ marginBottom: 64 }}>
        <div className="fed-divider" style={{ marginTop: 0 }}>
          <h2 className="fed-divider__title">Турнирная таблица</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>Официальная картина лиги · сортировка по очкам или по рейтингу AvanData</p>
        <StandingsBody />
      </section>

      {/* 2. Рейтинг и сила клубов (+ «Кто производит талант» внутри ClubsBody) — подняты сюда. */}
      <section style={{ marginBottom: 64 }}>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Рейтинг и сила клубов</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>Сила лиг, концентрация талантов · {division} лига</p>
        <ClubsBody />
      </section>

      {/* 4. Качество игроков — заменяет «Производство × результат». */}
      <section style={{ marginBottom: 64 }}>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Качество игроков</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>
          {year == null ? 'Игроки клуба в топ-100 города · все возрасты' : `Игроки клуба в сборной · ${scope}`}
        </p>
        <QualityBody />
      </section>

      {/* 5. Управление лигами — read-only советник перехода (зона пересечения лиг). */}
      <section>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Управление лигами</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 24 }}>
          Кто достоин выше, кого понизить — по зоне пересечения рейтингов соседних лиг · {scope}
        </p>
        <LeagueMgmtBody />
      </section>
    </div>
  );
}

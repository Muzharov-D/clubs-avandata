import { useFedYear } from './avYear';
import { ProductionBody } from './ProductionView';
import { LossMapBody } from './AvLossMap';
import { ClubsBody } from './AvClubs';
import { StandingsBody } from './StandingsBody';
import './avandata.css';

/**
 * «Клубы» — клуб как единица производства и потерь: официальная турнирная таблица
 * лиги (StandingsBody, год+дивизион) → производство × результат (ProductionBody,
 * по региону) → карта потерь по игровому времени (LossMapBody, когортный срез) →
 * рейтинг/сила клубов (ClubsBody, год+дивизион на бэке). Композиция тел
 * существующих экранов; у каждого блока свой скелетон — медленная загрузка
 * официальной таблицы не блокирует остальные. Когорта: блоки следуют глобальному
 * фильтру; производство пулится по региону (помечено в подписи).
 */
export function FederationClubs() {
  const { year, division } = useFedYear();
  const scope = year != null ? `${year} г.р.` : 'все возрасты';

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Клубы</h1>
          <p className="av-sub">Производство, потери и рейтинг школ · {division} лига · {scope}</p>
        </div>
      </header>

      {/* 1) Турнирная таблица — официальная картина лиги (ФФСПб ● / зеркало), год+дивизион.
             Свой скелетон: медленная первая загрузка официальных данных не блокирует блоки ниже. */}
      <StandingsBody />

      {/* 2) Производство × результат — по региону */}
      <ProductionBody />

      {/* 3) Карта потерь — когортный срез по игровому времени */}
      <section className="av-rise">
        <div className="av-section">
          <div>
            <h2 className="av-section-title">Карта потерь</h2>
            <p className="av-section-sub" style={{ margin: '2px 0 0' }}>Потери региона на этапе отбора и при распределении игрового времени · {scope}</p>
          </div>
        </div>
        <LossMapBody />
      </section>

      {/* 4) Рейтинг и сила клубов — год+дивизион на бэке */}
      <section className="av-rise">
        <div className="av-section">
          <div>
            <h2 className="av-section-title">Рейтинг и сила клубов</h2>
            <p className="av-section-sub" style={{ margin: '2px 0 0' }}>Сила лиг, концентрация талантов и таблица клубов · {division} лига</p>
          </div>
        </div>
        <ClubsBody />
      </section>
    </>
  );
}

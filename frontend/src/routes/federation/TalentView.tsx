import { useFedYear } from './avYear';
import { BestXiBody } from './BestXiView';
import { RegionLeaderboardBody } from './AvPlayers';
import { ScorersBody } from './ScorersView';
import './avandata.css';

/**
 * «Таланты» — кто в регионе лучший, по ОДНОЙ когорте за раз. Слева — единственное
 * на экране поле «Сборная региона» (BestXiBody, 1-4-3-3); справа — рейтинг игроков
 * (RegionLeaderboardBody, нормализован в 0–10); ниже — бомбардиры (ScorersBody).
 * Все три следуют глобальному фильтру года (один когортный срез — чинит «2009
 * рядом с 2016»). Композиция тел существующих экранов; дублирующее поле игроков
 * (внутри AvPlayers) убрано — питч здесь только один.
 */
export function FederationTalent() {
  const { year } = useFedYear();
  const scope = year != null ? `${year} г.р.` : 'все возрасты — выбери год сверху для одной когорты';

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Таланты</h1>
          <p className="av-sub">Сборная региона, рейтинг игроков и бомбардиры · {scope}</p>
        </div>
      </header>

      {/* Поле сборной (слева) + рейтинг игроков (справа) */}
      <div className="av-split av-rise">
        <section>
          <div className="av-section" style={{ marginBottom: 12 }}>
            <div>
              <h2 className="av-section-title">Сборная региона</h2>
              <p className="av-section-sub" style={{ margin: '2px 0 0' }}>Лучшие по индексу внутри линии · схема 1-4-3-3</p>
            </div>
          </div>
          <BestXiBody />
        </section>

        <aside style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <RegionLeaderboardBody withRising={false} />
        </aside>
      </div>

      {/* Восходящие младших когорт — полноширинная лента (правый столбец не растягиваем пустотой) */}
      <div className="av-rise">
        <RegionLeaderboardBody withLeaderboard={false} withRising />
      </div>

      {/* Бомбардиры региона (когортный срез по строкам топ-голов) */}
      <section className="av-rise">
        <div className="av-section">
          <div>
            <h2 className="av-section-title">Бомбардиры региона</h2>
            <p className="av-section-sub" style={{ margin: '2px 0 0' }}>Голы из протоколов ФФСПб · {scope}</p>
          </div>
        </div>
        <ScorersBody />
      </section>
    </>
  );
}

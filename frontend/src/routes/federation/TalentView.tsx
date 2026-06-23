import { useFedYear } from './avYear';
import { BestXiBody } from './BestXiView';
import { RegionLeaderboardBody } from './AvPlayers';
import { ScorersBody } from './ScorersView';
import { LossMapBody } from './AvLossMap';
import './federation.css';

export function FederationTalent() {
  const { year } = useFedYear();
  const scope = year != null ? `${year} г.р.` : 'все возрасты';

  return (
    <div>
      <div className="fed-hero">
        <div className="fed-hero__kicker">Кто лучший в регионе</div>
        <h1 className="fed-hero__title">Таланты</h1>
        <p className="fed-hero__sub">Сборная региона, рейтинг, бомбардиры и кого регион теряет · {scope}</p>
      </div>

      <div className="fed-grid fed-grid--2" style={{ marginBottom: 32 }}>
        <div>
          <div className="fed-divider" style={{ marginTop: 0 }}>
            <h2 className="fed-divider__title">Сборная региона</h2>
            <div className="fed-divider__line" />
          </div>
          <p className="fed-note" style={{ marginBottom: 16 }}>Сильнейшие игроки по рейтингу в каждой линии · схема 1-4-3-3</p>
          <BestXiBody />
        </div>

        <div>
          <div className="fed-divider" style={{ marginTop: 0 }}>
            <h2 className="fed-divider__title">Рейтинг</h2>
            <div className="fed-divider__line" />
          </div>
          <RegionLeaderboardBody withRising={false} />
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <RegionLeaderboardBody withLeaderboard={false} withRising />
      </div>

      <section>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Бомбардиры</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 16 }}>Голы из протоколов ФФСПб · {scope}</p>
        <ScorersBody />
      </section>

      <section style={{ marginTop: 32 }}>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Кого теряет регион</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 16 }}>Воронка отбора и игрового времени: кого регион теряет на входе и на скамейке · {scope}</p>
        <LossMapBody />
      </section>
    </div>
  );
}

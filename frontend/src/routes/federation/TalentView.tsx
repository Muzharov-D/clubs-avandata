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
      {/* Компактная шапка экрана: на «Талантах» главный фолд — две половины (питч | рейтинг)
          во весь экран, поэтому hero ужат (мелкий титул, минимальные отступы), чтобы отдать
          высоту двум панелям, но остаётся внятным заголовком раздела. */}
      <div className="fed-hero fed-hero--compact">
        <div className="fed-hero__kicker">Кто лучший в регионе</div>
        <h1 className="fed-hero__title fed-hero__title--compact">Таланты</h1>
        <p className="fed-hero__sub">Сборная региона, рейтинг, бомбардиры и кого регион теряет · {scope}</p>
      </div>

      {/* Главный фолд: 50/50 две колонки, заполняющие высоту вьюпорта под шапкой.
          Высота = экран минус топбар (~65) + фильтр-бар (~54) + верх .fed-page (~20) +
          компактный hero (~80). Каждая ячейка — flex-колонка: заголовок сверху + панель
          (питч слева / рейтинг справа), заполняющая остаток высоты. На узких — стек. */}
      <div className="fed-talent-split">
        <div className="fed-talent-split__cell">
          <div className="fed-divider fed-talent-split__head">
            <h2 className="fed-divider__title">Сборная региона</h2>
            <div className="fed-divider__line" />
          </div>
          <BestXiBody />
        </div>

        <div className="fed-talent-split__cell">
          <div className="fed-divider fed-talent-split__head">
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

import { useFedYear } from './avYear';
import { BestXiBody } from './BestXiView';
import { RegionLeaderboardBody } from './AvPlayers';
import { RankAboveBody } from './RankAbove';
import './federation.css';

export function FederationTalent() {
  const { year } = useFedYear();
  const scope = year != null ? `${year} г.р.` : 'все возрасты';

  return (
    <div>
      {/* Hero и внешние разделители «Сборная региона»/«Рейтинг» УБРАНЫ намеренно: вкладка
          «Таланты» уже подсвечена в топбаре, а обе карточки самоподписаны (левая — h3
          «Сборная … лиги · …» в BestXiBody, правая — .fed-card__title «Рейтинг игроков»
          + .fed-card__sub «N разобранных · …» в RegionLeaderboardBody). Поэтому главный
          фолд (питч | рейтинг) стартует сразу под фильтр-баром — отдаём ему ~112px верхней
          зоны, которые раньше съедали hero (~96px) и оба разделителя (~16px к старту колонки). */}

      {/* Главный фолд: 50/50 две колонки, заполняющие высоту вьюпорта под фильтр-баром.
          Каждая ячейка — flex-колонка с самоподписанной карточкой (питч слева / рейтинг
          справа). На узких — стек. */}
      <div className="fed-talent-split fed-talent-split--lead">
        <div className="fed-talent-split__cell">
          <BestXiBody />
        </div>

        <div className="fed-talent-split__cell">
          <RegionLeaderboardBody withRising={false} />
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <RegionLeaderboardBody withLeaderboard={false} withRising />
      </div>

      <section style={{ marginBottom: 32 }}>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Претенденты на повышение</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 16 }}>
          Игроки Первой, обходящие по рейтингу AvanData слабейших в Высшей на своей позиции и в своём возрасте — кандидаты на переход вверх · {scope} · решение за федерацией
        </p>
        <RankAboveBody />
      </section>

    </div>
  );
}

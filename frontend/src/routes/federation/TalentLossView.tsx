import { useAuth } from '../../contexts/AuthContext';
import { useFedYear } from './avYear';
import { AgeEffectBody, useRegionMap, type AgeCohort } from './AgeEffectView';
import { PyramidBody } from './PyramidView';
import { BuriedBody, useMinutes } from './BuriedView';
import './federation.css';

export function FederationTalentLoss() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const { year } = useFedYear();
  const region = federation?.region ?? federation?.name ?? 'Регион';
  const scope = year != null ? `${year} г.р.` : 'все возрасты';

  return (
    <div>
      <div className="fed-hero">
        <div className="fed-hero__kicker">Воронка отбора</div>
        <h1 className="fed-hero__title">Кого теряет регион</h1>
        <p className="fed-hero__sub">{region} · перекос по дате рождения, распределение по лигам, игровое время · {scope}</p>
      </div>

      <section style={{ marginBottom: 40 }}>
        <div className="fed-divider" style={{ marginTop: 0 }}>
          <h2 className="fed-divider__title">Перекос по возрастам</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 16 }}>Отношение числа рождённых в начале года к рождённым в конце</p>
        <AgeEffectBody />
      </section>

      <section style={{ marginBottom: 40 }}>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Пирамида лиг</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 16 }}>Верхние и нижние лиги</p>
        <PyramidBody />
      </section>

      <section style={{ marginBottom: 40 }}>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Карта возможностей</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 16 }}>Распределение игрового времени</p>
        <BuriedBody />
      </section>

      <section>
        <div className="fed-divider">
          <h2 className="fed-divider__title">Как сохранить таланты</h2>
          <div className="fed-divider__line" />
        </div>
        <p className="fed-note" style={{ marginBottom: 16 }}>Меры регулятора</p>
        <AvoidLossBody />
      </section>
    </div>
  );
}

interface Recommendation { title: string; rationale: string }

/**
 * «Как избежать потери» — редакционные рекомендации регулятора, НЕ метрика.
 * Текст привязан к реальным числам с этого же экрана: перекос когорт берём из
 * того же `region-map` (`useRegionMap`, ключ ['federation','region-map']), долю
 * долю на скамейке и медиану Q4 — из тех же `/minutes` (`useMinutes`, ключ
 * ['federation','minutes']). Никаких новых запросов и никаких выдуманных цифр:
 * если число недоступно из этих ответов — формулировка остаётся качественной.
 */
function AvoidLossBody() {
  const { data: regionMap } = useRegionMap();
  const { data: minutes } = useMinutes();

  const cohorts: AgeCohort[] = regionMap?.pyramid?.ageEffect ?? [];
  const withSkew = cohorts.filter((c): c is AgeCohort & { skew: number } => c.skew != null);
  const maxC = withSkew.reduce<(AgeCohort & { skew: number }) | null>(
    (m, c) => (m == null || c.skew > m.skew ? c : m),
    null,
  );

  const q4 = minutes?.byQuarter.find((q) => q.q === 4) ?? null;

  const recs: Recommendation[] = [
    {
      title: 'Возрастные квоты и группировка по зрелости при отборе',
      rationale: maxC
        ? `Перекос Q1÷Q4 в возрасте ${maxC.year} достигает ${maxC.skew}×: при просмотре группировать игроков по биологической зрелости, а не только по году рождения, и резервировать места для поздно рождённых.`
        : 'Группировать игроков при просмотре по биологической зрелости, а не только по году рождения, и резервировать места для поздно рождённых, чтобы перекос по дате рождения не определял отбор.',
    },
    {
      title: 'Контроль минимального игрового времени',
      rationale: minutes
        ? `Доля игроков на скамейке (<15% командных минут) — ${minutes.buried15Pct}% реестра, не выходят ни разу — ${minutes.neverPlayedPct}%. Ввести норматив минимального времени для прошедших отбор, иначе зачисление не конвертируется в развитие.`
        : 'Ввести норматив минимального игрового времени для прошедших отбор: зачисление в заявку без выхода на поле не конвертируется в развитие.',
    },
    {
      title: 'Пересмотр сетки лиг для поздно рождённых',
      rationale: q4 != null
        ? `Медиана игрового времени Q4 — ${q4.medianTime}% против старших кварталов: пересмотреть переходы между лигами так, чтобы нижние лиги оставались путём развития, а не местом, откуда сложно выбраться, для рождённых в конце года.`
        : 'Пересмотреть переходы между лигами так, чтобы нижние лиги оставались путём развития для поздно рождённых, а не тупиком отбора по росту и телосложению.',
    },
    {
      title: 'Регулярный мониторинг воронки отбора',
      rationale: 'Закрепить перекос по возрастам, пирамиду лиг и распределение игрового времени как периодические показатели и сверять динамику от сезона к сезону — мера управляема только при постоянном наблюдении.',
    },
  ];

  return (
    <div className="fed-card">
      <div className="fed-card__title">Рекомендации регулятора</div>
      <div className="fed-card__sub">Меры на основе показателей выше — для решения федерации</div>
      <div>
        {recs.map((r, i) => (
          <div
            key={i}
            className="fed-row"
            style={{ alignItems: 'flex-start', borderBottom: i === recs.length - 1 ? 'none' : undefined }}
          >
            <span className="fed-badge fed-badge--accent" style={{ flexShrink: 0 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="fed-row__name">{r.title}</div>
              <div className="fed-row__meta" style={{ marginTop: 4, lineHeight: 1.6 }}>{r.rationale}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

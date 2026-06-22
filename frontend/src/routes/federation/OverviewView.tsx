import { useAuth } from '../../contexts/AuthContext';
import { RegionCensusBody } from './RegionMap';
import { DiscoveriesBody } from './DiscoveriesView';
import './federation.css';

/**
 * «Обзор» (главная кабинета федерации) — перепись региона (KPI-тоталы пирамиды
 * FFSPB + «По лигам» + кадры) поверх снимка region_census, затем карточки-приговоры
 * «Открытий» со ссылками в 3 других таба. Композиция RegionCensusBody +
 * DiscoveriesBody (тела существующих экранов), без дубля шапок. Блок «Состав по
 * возрастам» (1-клубно разрежен) намеренно опущен внутри RegionCensusBody.
 */
export function FederationOverview() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const region = federation?.region ?? federation?.name ?? 'Регион';

  return (
    <div className="fed-stack">
      <header className="fed-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="fed-title">Обзор региона</h1>
          <p className="fed-sub">{region} · сводные данные детско-юношеского футбола и аналитические выводы для регулятора</p>
        </div>
      </header>

      {/* Перепись: тоталы пирамиды FFSPB + по лигам + кадры */}
      <RegionCensusBody />

      {/* Открытия региона — вердикты со ссылками вглубь (в 3 других таба) */}
      <section>
        <div className="fed-head" style={{ marginBottom: 14 }}>
          <div>
            <h2 className="fed-title" style={{ fontSize: 19 }}>Аналитические выводы</h2>
            <p className="fed-sub">Вывод → подтверждающие данные → переход к разделу</p>
          </div>
        </div>
        <DiscoveriesBody />
      </section>
    </div>
  );
}

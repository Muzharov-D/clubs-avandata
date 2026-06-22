import { useAuth } from '../../contexts/AuthContext';
import { RegionCensusBody } from './RegionMap';
import { PlayTimeStripBody } from './BuriedView';
import { DiscoveriesBody } from './DiscoveriesView';
import './federation.css';

export function FederationOverview() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const region = federation?.region ?? federation?.name ?? 'Регион';

  return (
    <div>
      <div className="fed-hero">
        <div className="fed-hero__kicker">Кабинет федерации</div>
        <h1 className="fed-hero__title">{region}</h1>
        <p className="fed-hero__sub">Сводные данные детско-юношеского футбола и аналитические выводы для регулятора</p>
      </div>

      <RegionCensusBody />

      <div className="fed-divider">
        <h2 className="fed-divider__title">Игровое время региона</h2>
        <div className="fed-divider__line" />
      </div>
      <p className="fed-note" style={{ marginTop: -8, marginBottom: 20 }}>
        Сколько занимающихся реально выходят на поле, а сколько числятся на лавке — по региону.
      </p>
      <PlayTimeStripBody />

      <div className="fed-divider">
        <h2 className="fed-divider__title">Аналитические выводы</h2>
        <div className="fed-divider__line" />
      </div>
      <DiscoveriesBody />
    </div>
  );
}

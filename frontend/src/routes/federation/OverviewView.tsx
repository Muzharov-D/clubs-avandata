import { useAuth } from '../../contexts/AuthContext';
import { RegionCensusBody } from './RegionMap';
import { PlayTimeStripBody } from './BuriedView';
import './federation.css';

export function FederationOverview() {
  const { federation } = useAuth() as { federation: { region?: string; name?: string } | null };
  const region = federation?.region ?? federation?.name ?? 'Регион';

  return (
    <div>
      <div className="fed-hero" style={{ marginBottom: 14 }}>
        <h1 className="fed-hero__title" style={{ fontSize: 28 }}>{region}</h1>
        <p className="fed-hero__sub" style={{ fontSize: 14 }}>Сводные данные детско-юношеского футбола и аналитические выводы для регулятора</p>
      </div>

      <RegionCensusBody />

      <div className="fed-divider">
        <h2 className="fed-divider__title">Игровое время · Высшая и Первая</h2>
        <div className="fed-divider__line" />
      </div>
      <p className="fed-note" style={{ marginTop: -8, marginBottom: 20 }}>
        Сколько занимающихся реально выходят на поле, а сколько числятся на скамейке.
      </p>
      <PlayTimeStripBody />
    </div>
  );
}

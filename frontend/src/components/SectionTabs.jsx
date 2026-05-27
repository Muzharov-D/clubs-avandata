import './Tabs.css';

export default function SectionTabs({ tabs, active, onChange }) {
  return (
    <div className="tabs tabs--section">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tabs__item ${active === t.id ? 'tabs__item--active' : ''}`}
          onClick={() => onChange?.(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

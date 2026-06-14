/**
 * Соревнования региона — сводные таблицы, результаты, кубки (открытый слой).
 * Story 0.8 — заглушка-каркас; реальные данные подключаются в Эпике 3.
 */
export function FederationCompetitions() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display, inherit)', fontSize: 20, fontWeight: 600, margin: 0 }}>
        Соревнования региона
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
        Сводные таблицы по всем клубам турнира
      </p>
      <div
        style={{
          marginTop: 16,
          padding: 24,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          color: 'var(--text-muted)',
          fontSize: 14,
        }}
      >
        Сводные турнирные таблицы по возрастам появятся здесь.
      </div>
    </div>
  );
}

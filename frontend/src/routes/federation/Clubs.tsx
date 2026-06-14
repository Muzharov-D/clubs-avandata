/**
 * Клубы федерации — реестр клубов-членов (охват, рейтинг, сравнение).
 * Story 0.8 — заглушка-каркас; реальные данные подключаются в Эпике 2.
 */
export function FederationClubs() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display, inherit)', fontSize: 20, fontWeight: 600, margin: 0 }}>
        Клубы федерации
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
        Реестр клубов-членов региона
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
        Реестр клубов с показателями и полнотой данных появится здесь.
      </div>
    </div>
  );
}

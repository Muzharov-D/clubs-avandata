/**
 * Обзор региона — пульс федерации (KPI, честный охват, активность).
 * Story 0.8 — заглушка-каркас; реальные данные подключаются в Эпике 1.
 */
export function FederationOverview() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display, inherit)', fontSize: 20, fontWeight: 600, margin: 0 }}>
        Обзор региона
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
        Санкт-Петербург · детско-юношеский футбол
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
        Подключаем данные региона. Ключевые показатели и честный охват появятся здесь.
      </div>
    </div>
  );
}

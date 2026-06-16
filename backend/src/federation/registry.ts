/**
 * Административный реестр федерации — цифры, которых НЕТ в матчевых данных
 * (тренеры, судьи, всего занимающихся). Источник — годовой отчёт/реестр
 * федерации, не наша БД. Показываются на «Карте региона» с явной пометкой
 * источника. Редактируемый конфиг: правится здесь, без миграции.
 */
export interface FederationRegistry {
  /** Штатные тренеры региона (форма 1-ФК + 5-ФК). */
  coaches: number | null;
  /** Судьи по футболу региона. */
  referees: number | null;
  /** Всего занимающихся футболом (форма 1-ФК). */
  participants: number | null;
  /** Подпись источника для UI. */
  source: string;
  /** Период данных реестра. */
  period: string;
}

const REGISTRY: Record<string, FederationRegistry> = {
  // Санкт-Петербург (ФФСПб) — оперативные данные годового отчёта.
  ffspb: { coaches: 456, referees: 217, participants: 48664, source: 'Реестр ФФСПб', period: '2024' },
};

export function registryFor(slug: string): FederationRegistry | null {
  return REGISTRY[slug] ?? null;
}

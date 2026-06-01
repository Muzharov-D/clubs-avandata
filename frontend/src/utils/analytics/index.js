/**
 * Единый аналитический слой Clubs · Avandata (миссия «Погнали», п.100).
 * Прозрачные модели на реальных полях SportVisor: per-90, перцентили,
 * xG/xT/xA/packing, PPDA/прессинг, PAdj-оборона, форма, role-fit, momentum,
 * стандарты, нарратив. Питает MatchDetail / PlayerDetail / ClubDashboard.
 */
export * from './metrics';
export * from './per90';
export * from './percentiles';
export * from './xg';
export * from './progression';
export * from './ppda';
export * from './padj';
export * from './form';
export * from './roles';
export * from './motm';
export * from './momentum';
export * from './setpieces';
export * from './narrative';

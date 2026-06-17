import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

/** Дивизионы Первенства. База — Высшая лига; вместе только в режиме сравнения. */
export const DIVISIONS = ['Высшая', 'Первая'] as const;
export type Division = (typeof DIVISIONS)[number];

interface Ctx {
  year: number | null; setYear: (y: number | null) => void; years: number[];
  division: Division; setDivision: (d: Division) => void;
}
const FedYearCtx = createContext<Ctx>({ year: null, setYear: () => {}, years: [], division: 'Высшая', setDivision: () => {} });

export const useFedYear = () => useContext(FedYearCtx);
/** Совпадает ли название дивизиона (с бэка) с выбранной лигой — для клиентского фильтра групп. */
const DIV_RE: Record<string, RegExp> = { 'Высшая': /Высшая|Боброва/i, 'Первая': /Первая|Дементьева/i };
export const inDivision = (title: string, division: Division) => DIV_RE[division]?.test(title) ?? true;
/** Суффикс query только по году рождения (для эндпоинтов без дивизиона). */
export const yearQ = (year: number | null) => (year != null ? `?year=${year}` : '');
/** Суффикс query год+дивизион — для эндпоинтов, фильтрующих по дивизиону на бэке. */
export const fedQ = (year: number | null, division: Division | null) => {
  const p: string[] = [];
  if (year != null) p.push(`year=${year}`);
  if (division) p.push(`division=${encodeURIComponent(division)}`);
  return p.length ? `?${p.join('&')}` : '';
};

export function FedYearProvider({ children }: { children: ReactNode }) {
  const [year, setYear] = useState<number | null>(null);
  const [division, setDivision] = useState<Division>('Высшая');
  const { data } = useQuery({ queryKey: ['av', 'years'], queryFn: () => api<{ years: number[] }>('/federation/av/years') });
  return <FedYearCtx.Provider value={{ year, setYear, years: data?.years ?? [], division, setDivision }}>{children}</FedYearCtx.Provider>;
}

/** Переключатель дивизиона — в верхнем баре, база Высшая лига. */
export function DivisionFilter() {
  const { division, setDivision } = useFedYear();
  return (
    <div className="av-divbar" role="tablist" aria-label="Дивизион">
      <span className="av-yearbar__label">Лига</span>
      {DIVISIONS.map((d) => (
        <button key={d} className={`av-dchip${division === d ? ' av-dchip--active' : ''}`} onClick={() => setDivision(d)}>{d}</button>
      ))}
    </div>
  );
}

/** Фильтр возрастов (год рождения) — в верхнем баре, общий для всех экранов. */
export function YearFilter() {
  const { year, setYear, years } = useFedYear();
  return (
    <div className="av-yearbar" role="tablist" aria-label="Год рождения">
      <span className="av-yearbar__label">Год рождения</span>
      <button className={`av-ychip${year == null ? ' av-ychip--active' : ''}`} onClick={() => setYear(null)}>Все</button>
      {years.map((y) => (
        <button key={y} className={`av-ychip${year === y ? ' av-ychip--active' : ''}`} onClick={() => setYear(y)}>{y}</button>
      ))}
    </div>
  );
}

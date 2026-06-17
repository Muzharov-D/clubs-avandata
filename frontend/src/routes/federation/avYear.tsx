import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

interface Ctx { year: number | null; setYear: (y: number | null) => void; years: number[] }
const FedYearCtx = createContext<Ctx>({ year: null, setYear: () => {}, years: [] });

export const useFedYear = () => useContext(FedYearCtx);
/** Суффикс query для фильтра по году рождения. */
export const yearQ = (year: number | null) => (year != null ? `?year=${year}` : '');

export function FedYearProvider({ children }: { children: ReactNode }) {
  const [year, setYear] = useState<number | null>(null);
  const { data } = useQuery({ queryKey: ['av', 'years'], queryFn: () => api<{ years: number[] }>('/federation/av/years') });
  return <FedYearCtx.Provider value={{ year, setYear, years: data?.years ?? [] }}>{children}</FedYearCtx.Provider>;
}

/** Фильтр возрастов (год рождения) — в верхнем баре, общий для всех экранов. */
export function YearFilter() {
  const { year, setYear, years } = useFedYear();
  return (
    <div className="av-yearbar" role="tablist" aria-label="Год рождения">
      <span className="av-yearbar__label">Возраст</span>
      <button className={`av-ychip${year == null ? ' av-ychip--active' : ''}`} onClick={() => setYear(null)}>Все</button>
      {years.map((y) => (
        <button key={y} className={`av-ychip${year === y ? ' av-ychip--active' : ''}`} onClick={() => setYear(y)}>{y}</button>
      ))}
    </div>
  );
}

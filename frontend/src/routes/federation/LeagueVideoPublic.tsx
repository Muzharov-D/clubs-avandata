import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MatchHead } from './SecondLeagueView';
import './secondLeague.css';
import './leagueVideoPublic.css';

// ПУБЛИЧНАЯ страница видео матча Второй лиги (без входа) — цель «поделиться».
// Лого команд + дата + счёт + видео. Данные — /api/v1/public/second-league/match/:id.

interface PubMatch {
  id: number; age: string; tour: number | null;
  home: string; away: string; homeLogo: string | null; awayLogo: string | null;
  date: string | null; venue: string | null;
  score: string | null; scoreHome: number | null; scoreAway: number | null; played: boolean;
  parts: string[]; status: string | null;
}

export function LeagueVideoPublic() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ['pub-sl-video', id],
    queryFn: async (): Promise<PubMatch> => {
      const r = await fetch(`/api/v1/public/second-league/match/${id}`);
      if (!r.ok) throw new Error('not found');
      return r.json();
    },
  });
  const [part, setPart] = useState(0);
  const m = q.data;
  const parts = m?.parts ?? [];

  function share() {
    const url = window.location.href;
    const title = m ? `${m.home.trim()} ${m.score ?? ''} ${m.away.trim()} · Вторая лига`.replace(/\s+/g, ' ').trim() : 'Вторая лига';
    const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> };
    if (nav.share) { nav.share({ title, url }).catch(() => {}); return; }
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  return (
    <div className="lvp">
      <header className="lvp__top">
        <img src="/brand/logo-dark.svg" alt="АванData" className="lvp__logo" />
        <span className="lvp__league">Вторая лига · ФФСПб</span>
      </header>

      <main className="lvp__main">
        {q.isLoading && <div className="sl-vstage" style={{ maxWidth: 1000, margin: '0 auto' }}>Загрузка…</div>}
        {q.isError && <div className="lvp__empty">Матч не найден.</div>}
        {m && (
          <div className="lvp__card">
            {m.age && <div className="lvp__age">{m.age}{m.tour != null ? ` · Тур ${m.tour}` : ''}</div>}
            <MatchHead m={m} big />
            {parts.length > 1 && (
              <div className="sl-halves" style={{ justifyContent: 'center', width: '100%' }}>
                {parts.map((_, i) => <button key={i} type="button" aria-pressed={i === part} onClick={() => setPart(i)}>{i + 1}-я половина</button>)}
              </div>
            )}
            <div className="sl-vstage">
              {parts.length ? <video key={part} controls autoPlay playsInline src={parts[part]} />
                : `Видео ещё рендерится${m.status ? ` (статус ${m.status})` : ''}.`}
            </div>
            <button type="button" className="sl-share lvp__share" onClick={share}>↗ Поделиться</button>
          </div>
        )}
      </main>

      <footer className="lvp__foot">Видео матча · АванData</footer>
    </div>
  );
}

// Bottom sheet для добавления/переключения команды.
// Две страницы со свайпом: «Младшие» и «Старшие». CSS scroll-snap, без библиотек.
//
// Тап на карточку:
//   - если age уже в myTeams → просто переключаем activeTeam
//   - если новый → добавляем в myTeams и активируем
// В обоих случаях — навигация на /public/team/{age} и закрытие sheet'а.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AGE_GROUPS_YOUNGER,
  AGE_GROUPS_OLDER,
  tierForAge,
  displayAge,
} from '../utils/ageRating';
import { useMyTeams, addAndActivate } from '../utils/myTeams';
import './AddTeamSheet.css';

export default function AddTeamSheet({ open, onClose }) {
  const navigate = useNavigate();
  const { teams: myTeams, active } = useMyTeams();
  const scrollerRef = useRef(null);
  const [pageIdx, setPageIdx] = useState(0); // 0=Младшие, 1=Старшие

  // ───────── Lock body scroll + Esc to close ─────────
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // ───────── Сброс на первую страницу при каждом открытии ─────────
  useEffect(() => {
    if (open && scrollerRef.current) {
      scrollerRef.current.scrollLeft = 0;
      setPageIdx(0);
    }
  }, [open]);

  // ───────── Считаем активную страницу при свайпе ─────────
  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== pageIdx) setPageIdx(idx);
  }

  function gotoPage(idx) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  }

  function pick(age) {
    addAndActivate(age);
    onClose?.();
    navigate(`/public/team/${age}`);
  }

  if (!open) return null;

  return (
    <div className="addteam" onClick={onClose}>
      <div className="addteam__sheet" onClick={(e) => e.stopPropagation()}>
        <div className="addteam__handle" aria-hidden />

        <div className="addteam__head">
          <div className="addteam__title">Выбрать команду</div>
          <button
            type="button"
            className="addteam__close"
            onClick={onClose}
            aria-label="Закрыть"
          >×</button>
        </div>

        {/* Page indicator + табы */}
        <div className="addteam__pager">
          <button
            type="button"
            className={'addteam__pagerbtn' + (pageIdx === 0 ? ' is-active' : '')}
            onClick={() => gotoPage(0)}
          >Младшие</button>
          <button
            type="button"
            className={'addteam__pagerbtn' + (pageIdx === 1 ? ' is-active' : '')}
            onClick={() => gotoPage(1)}
          >Старшие</button>
        </div>

        {/* Свайпер — две страницы */}
        <div
          className="addteam__scroller"
          ref={scrollerRef}
          onScroll={handleScroll}
        >
          <div className="addteam__page">
            <div className="addteam__grid addteam__grid--younger">
              {AGE_GROUPS_YOUNGER.map((a) => renderCard(a, myTeams, active, pick))}
            </div>
          </div>
          <div className="addteam__page">
            <div className="addteam__grid addteam__grid--older">
              {AGE_GROUPS_OLDER.map((a) => renderCard(a, myTeams, active, pick))}
            </div>
          </div>
        </div>

        {/* Точки-индикатор */}
        <div className="addteam__dots">
          <span className={'addteam__dot' + (pageIdx === 0 ? ' is-active' : '')} />
          <span className={'addteam__dot' + (pageIdx === 1 ? ' is-active' : '')} />
        </div>
      </div>
    </div>
  );
}

function renderCard(a, myTeams, active, onPick) {
  const isMine   = myTeams.includes(a);
  const isActive = a === active;
  const cls = [
    'addteam__card',
    isMine && 'addteam__card--mine',
    isActive && 'addteam__card--active',
  ].filter(Boolean).join(' ');
  return (
    <button
      key={a}
      type="button"
      className={cls}
      onClick={() => onPick(a)}
    >
      <div className="addteam__card-year">{displayAge(a)}</div>
      <div className="addteam__card-tier">{tierForAge(a)}</div>
      {isMine && <div className="addteam__card-badge">{isActive ? 'Активна' : 'В избранном'}</div>}
    </button>
  );
}

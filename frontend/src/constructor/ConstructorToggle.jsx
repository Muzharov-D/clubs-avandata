// Кнопка «Настроить» в шапке — включает режим редактирования блоков для ТЕКУЩЕЙ
// страницы. Видна только тренеру и только на страницах, у которых есть
// настраиваемые блоки (есть в реестре).

import { useLocation, useNavigate } from 'react-router-dom';
import { useDashboardLayout } from './DashboardLayoutContext';
import { resolvePage } from './blockRegistry';
import './ConstructorToggle.css';

export default function ConstructorToggle() {
  const { canEdit, editMode, setEditMode } = useDashboardLayout();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (!canEdit) return null;
  const page = resolvePage(pathname);
  if (!page) return null; // на этой странице нечего настраивать

  return (
    <div className="cstr-toggle-wrap">
      <button
        type="button"
        className={`cstr-toggle${editMode ? ' cstr-toggle--on' : ''}`}
        onClick={() => setEditMode(!editMode)}
        title={editMode
          ? 'Выйти из режима настройки страницы'
          : `Настроить блоки: ${page.label}`}
        aria-pressed={editMode}
      >
        {editMode ? '✓ Готово' : '⚙ Настроить'}
      </button>
      {editMode && (
        <button
          type="button"
          className="cstr-toggle cstr-toggle--ghost"
          onClick={() => navigate('/constructor')}
          title="Открыть конструктор всех страниц"
        >
          Все страницы
        </button>
      )}
    </div>
  );
}

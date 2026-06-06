// Обёртка настраиваемого блока/графика.
//
// Обычный режим:
//   • видим  → прозрачная обёртка (display:contents) — НОЛЬ влияния на вёрстку;
//   • скрыт  → не рендерится вовсе.
// Режим редактирования (только тренер): всегда рендерит содержимое + рамку с
// подписью блока и «глазиком» (показать/скрыть). Скрытый блок приглушается.
//
// Содержимое всегда лежит в .cstr-block__body на одной глубине → переключение
// режима НЕ перемонтирует тяжёлые графики.

import { useDashboardLayout } from './DashboardLayoutContext';
import { blockLabel } from './blockRegistry';
import './Block.css';

/**
 * @param {{ page: string, id: string, children: React.ReactNode }} props
 */
export default function Block({ page, id, children }) {
  const { isVisible, editMode, canEdit, toggle } = useDashboardLayout();
  const visible = isVisible(page, id);
  const editing = editMode && canEdit;

  if (!editing && !visible) return null;

  const cls = [
    'cstr-block',
    editing ? 'cstr-block--edit' : '',
    editing && !visible ? 'cstr-block--hidden' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      {editing && (
        <div className="cstr-block__bar">
          <span className="cstr-block__label">{blockLabel(page, id)}</span>
          <button
            type="button"
            className={`cstr-block__eye${visible ? ' cstr-block__eye--on' : ''}`}
            role="switch"
            aria-checked={visible}
            onClick={() => toggle(page, id)}
            title={visible ? 'Скрыть блок' : 'Показать блок'}
          >
            {visible ? '👁 Показан' : '🚫 Скрыт'}
          </button>
        </div>
      )}
      <div className="cstr-block__body">{children}</div>
    </div>
  );
}

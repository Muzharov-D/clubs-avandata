// Экран-хаб «Конструктор» — массовая настройка видимости блоков по всем
// страницам сразу. Альтернатива режиму редактирования прямо на странице.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PAGES } from '../constructor/blockRegistry';
import { useDashboardLayout } from '../constructor/DashboardLayoutContext';
import './ConstructorPage.css';

export default function ConstructorPage() {
  const navigate = useNavigate();
  const { layout, isVisible, setBlock, resetPage, resetAll, saveNow } = useDashboardLayout();
  // Статус сохранения с привязкой к источнику: 'all' (верхняя кнопка) или pageId
  // (кнопка в шапке карточки) — чтобы «✓ Сохранено» загоралось там, где нажали.
  const [saveState, setSaveState] = useState({ id: null, status: 'idle' });
  const handleSave = async (id) => {
    setSaveState({ id, status: 'saving' });
    try {
      await saveNow();
      setSaveState({ id, status: 'saved' });
      setTimeout(() => setSaveState((s) => (s.id === id ? { id: null, status: 'idle' } : s)), 2000);
    } catch {
      setSaveState({ id: null, status: 'idle' });
    }
  };
  const saveLabel = (id) => {
    if (saveState.id === id && saveState.status === 'saving') return 'Сохранение…';
    if (saveState.id === id && saveState.status === 'saved') return '✓ Сохранено';
    return 'Сохранить';
  };
  const isSaving = (id) => saveState.id === id && saveState.status === 'saving';
  const isSaved = (id) => saveState.id === id && saveState.status === 'saved';

  const totalHidden = Object.values(layout || {})
    .reduce((acc, page) => acc + Object.values(page || {}).filter((v) => v === false).length, 0);

  return (
    <div className="cstr-page">
      <header className="cstr-page__hero">
        <div>
          <h1 className="cstr-page__title">Конструктор кабинета</h1>
          <p className="cstr-page__subtitle">
            Скрывайте и показывайте любые блоки и графики на каждой странице — вид
            подстроится под вас и сохранится на всех устройствах.
          </p>
        </div>
        <div className="cstr-page__actions">
          <button
            type="button"
            className={`cstr-page__save${isSaved('all') ? ' is-saved' : ''}`}
            onClick={() => handleSave('all')}
            disabled={isSaving('all')}
          >
            {saveLabel('all')}
          </button>
          <button
            type="button"
            className="cstr-page__reset-all"
            onClick={resetAll}
            disabled={totalHidden === 0}
            title="Показать все блоки на всех страницах"
          >
            Сбросить всё{totalHidden > 0 ? ` (${totalHidden})` : ''}
          </button>
        </div>
      </header>

      <div className="cstr-page__grid">
        {PAGES.map((page) => {
          const hiddenCount = page.blocks.filter((b) => !isVisible(page.id, b.id)).length;
          return (
            <section key={page.id} className="cstr-card">
              <div className="cstr-card__head">
                <span className="cstr-card__icon" aria-hidden>{page.icon || '▦'}</span>
                <div className="cstr-card__titles">
                  <h2 className="cstr-card__title">{page.label}</h2>
                  <span className="cstr-card__meta">
                    {hiddenCount > 0 ? `Скрыто: ${hiddenCount} из ${page.blocks.length}` : 'Показаны все'}
                  </span>
                </div>
                <button
                  type="button"
                  className={`cstr-card__save${isSaved(page.id) ? ' is-saved' : ''}`}
                  onClick={() => handleSave(page.id)}
                  disabled={isSaving(page.id)}
                  title="Сохранить изменения"
                >
                  {saveLabel(page.id)}
                </button>
                <button
                  type="button"
                  className="cstr-card__reset"
                  onClick={() => resetPage(page.id)}
                  disabled={hiddenCount === 0}
                  title="Показать все блоки этой страницы"
                >
                  Сбросить
                </button>
              </div>

              <ul className="cstr-card__list">
                {page.blocks.map((b) => {
                  const on = isVisible(page.id, b.id);
                  return (
                    <li key={b.id} className="cstr-row">
                      <span className="cstr-row__label">{b.label}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        className={`cstr-switch${on ? ' cstr-switch--on' : ''}`}
                        onClick={() => setBlock(page.id, b.id, !on)}
                        title={on ? 'Скрыть' : 'Показать'}
                      >
                        <span className="cstr-switch__knob" />
                      </button>
                    </li>
                  );
                })}
              </ul>

              {page.route && page.route.indexOf(':') === -1 && (
                <button
                  type="button"
                  className="cstr-card__open"
                  onClick={() => navigate(page.route)}
                >
                  Открыть страницу →
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

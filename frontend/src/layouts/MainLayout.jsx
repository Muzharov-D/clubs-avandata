import { Outlet } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import SidebarNav from '../components/SidebarNav';

// ИИ-агент полностью удалён в Sprint 2 cleanup. Будет переписан под LLM
// (Claude/GPT) с retrieval по матчам сезона — см. HANDOFF.md, Точки роста.

export default function MainLayout() {
  return (
    <div className="app-layout">
      <AppHeader />
      <div className="app-body">
        <SidebarNav />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

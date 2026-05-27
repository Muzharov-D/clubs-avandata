import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Базовая палитра Легируса (Montserrat + Xolonium + dark gradient)
import './styles/legirus-base.css';
import './styles/legirus-app.css';
import './styles/mobile.css';

// Tenant-specific overrides (CSS vars, admin styles)
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA service worker — регистрация только если sw.js существует.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((err) => console.warn('[sw] регистрация не удалась:', err));
  });
}

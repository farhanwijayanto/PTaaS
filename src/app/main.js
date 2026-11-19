import { startRouter } from '../lib/router.js';
import { useAuth, hydrateSessionFromServer } from '../lib/auth.js';
import { routes } from './routes.js';
import { createAppLayout, createBareLayout } from './shell.js';
import { forbiddenView, notFoundView } from '../features/auth/errors.js';
import { startIdleTicker } from '../features/vm/idle-ticker.js';
import { openCommandPalette } from '../components/layout/command-palette.js';

export function initPtaasApp() {
  if (typeof window === 'undefined' || window.__ptaasMounted) return;
  const root = document.getElementById('root');
  if (!root) return;
  window.__ptaasMounted = true;

  // Lucide icons: <i data-lucide> placeholders become inline SVG (1.5px stroke) whenever the DOM changes.
  let frame;
  const paintIcons = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => window.lucide?.createIcons({ attrs: { 'stroke-width': 1.5 } }));
  };
  new MutationObserver(paintIcons).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (useAuth().isAuthenticated) openCommandPalette();
    }
  });

  startIdleTicker();
  hydrateSessionFromServer();

  const app = createAppLayout(root);
  startRouter({
    routes,
    layouts: { app, bare: createBareLayout(root, app) },
    notFound: notFoundView,
    forbidden: forbiddenView
  });
  paintIcons();
}

if (typeof window !== 'undefined' && document.readyState !== 'loading') {
  initPtaasApp();
} else if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initPtaasApp);
}

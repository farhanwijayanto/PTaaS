// History-API router with role-aware route guards.
import { useAuth } from './auth.js';
import { on } from './events.js';
import { t } from './i18n.js';
import { closeMenus } from '../components/ui/dropdown.js';
import { loadMotionMini, isReducedMotion, EASINGS } from './motion.js';

let table = [];
let layouts = {};
let views = {};
let cleanups = [];
let token = 0;
let first = true;

// Pages call this during render to release timers/subscriptions on navigation.
export const onCleanup = (fn) => cleanups.push(fn);

function compile(path) {
  const keys = [];
  const source = path.replace(/:([A-Za-z]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { re: new RegExp(`^${source}/?$`), keys };
}

let lastRouteKey = '';

export function startRouter({ routes, layouts: l, notFound, forbidden }) {
  table = routes.map((r) => ({ ...r, ...compile(r.path) }));
  layouts = l;
  views = { notFound, forbidden };
  lastRouteKey = location.pathname + location.search;
  document.addEventListener('click', onLinkClick);
  window.addEventListener('popstate', () => {
    const nextKey = location.pathname + location.search;
    if (nextKey === lastRouteKey) return;
    resolve();
  });
  on('session', () => resolve({ soft: true }));
  on('lang', () => resolve({ soft: true }));
  resolve();
}

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.origin);
  if (!replace && url.pathname + url.search === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
  resolve();
}

export const query = () => new URLSearchParams(location.search);

function onLinkClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest?.('a[data-link]');
  if (!link || (link.target && link.target !== '_self')) return;
  e.preventDefault();
  navigate(link.getAttribute('href'));
}

async function resolve({ soft = false } = {}) {
  closeMenus();
  cleanups.splice(0).forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  const mine = ++token;
  const path = location.pathname.replace(/\/+$/, '') || '/';

  let route = null;
  const params = {};
  for (const r of table) {
    const match = path.match(r.re);
    if (match) {
      route = r;
      r.keys.forEach((key, i) => { params[key] = decodeURIComponent(match[i + 1]); });
      break;
    }
  }

  const auth = useAuth();

  if (route?.redirect) {
    navigate(typeof route.redirect === 'function' ? route.redirect(auth) : route.redirect, { replace: true });
    return;
  }
  if (!auth.isAuthenticated && (!route || route.auth !== false)) {
    navigate('/login', { replace: true });
    return;
  }

  let node;
  let layout = route?.layout || 'app';
  try {
    if (!route) node = views.notFound();
    else if (route.roles && !route.roles.includes(auth.role)) node = views.forbidden(route.roles);
    else node = await route.view({ params, query: query(), auth });
  } catch (err) {
    console.error(err);
    node = views.notFound();
  }
  if (mine !== token) return; // a newer navigation superseded this one

  const prevPath = layouts[layout]?.currentPath;
  lastRouteKey = location.pathname + location.search;
  document.title = route?.titleKey ? `${t(route.titleKey)} · PTaaS` : 'PTaaS Cloud';
  layouts[layout].show(node, { route, path });
  if (layouts[layout]) layouts[layout].currentPath = path;

  // Smooth 0.25s fade + 12px slide transition between Landing (/) and Login (/login)
  if (!first && !soft && !isReducedMotion() && node && (
    (prevPath === '/' && path === '/login') ||
    (prevPath === '/login' && path === '/') ||
    (path === '/login' && document.referrer === '' && prevPath !== '/login')
  )) {
    const dir = path === '/login' ? 12 : -12;
    loadMotionMini().then(({ animate }) => {
      animate(node, { opacity: [0.001, 1], y: [dir, 0] }, { duration: 0.25, ease: EASINGS.expoOut });
    }).catch(() => {});
  }

  if (!first && !soft) {
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }
  first = false;
}

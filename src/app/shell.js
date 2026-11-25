import { h } from '../lib/dom.js';
import { Sidebar, closeMobileSidebar } from '../components/layout/sidebar.js';
import { Topbar } from '../components/layout/topbar.js';
import { initVmStore, subscribeVms } from '../lib/vm-store.js';

/**
 * Main application layout shell with fixed sidebar + sticky topbar + scrollable content.
 * Subscribes to the shared VM store so sidebar badges & quota meters stay live in real time.
 */
export function createAppLayout(root) {
  let shell = null;
  let currentPath = '/dashboard';
  let unsubscribeVms = null;

  const build = () => {
    const sidebarHost = h('div', { class: 'contents' });
    const topbarHost = h('div', { class: 'contents' });
    const outlet = h('div', { class: 'w-full' });
    const main = h('main', { id: 'main', tabindex: '-1', class: 'app-content' }, outlet);
    const overlay = h('div', { class: 'sb-overlay', onClick: closeMobileSidebar });

    const mainArea = h('div', { class: 'app-main' },
      topbarHost,
      main
    );

    const layout = h('div', { class: 'app-layout' },
      sidebarHost,
      overlay,
      mainArea
    );

    return { layout, sidebarHost, topbarHost, outlet };
  };

  return {
    show(node, { route, path }) {
      currentPath = path;
      if (!shell) {
        shell = build();
        root.replaceChildren(shell.layout);
      }
      initVmStore();
      if (!unsubscribeVms) {
        unsubscribeVms = subscribeVms(() => {
          if (shell) {
            shell.sidebarHost.replaceChildren(Sidebar({ path: currentPath }));
          }
        });
      }
      closeMobileSidebar();
      shell.sidebarHost.replaceChildren(Sidebar({ path }));
      shell.topbarHost.replaceChildren(Topbar({ path, route }));
      shell.outlet.replaceChildren(h('div', { class: 'page-enter' }, node));
    },
    reset() {
      if (unsubscribeVms) {
        unsubscribeVms();
        unsubscribeVms = null;
      }
      shell = null;
    }
  };
}

export function createBareLayout(root, app) {
  return {
    show(node) {
      app.reset();
      root.replaceChildren(node);
    }
  };
}

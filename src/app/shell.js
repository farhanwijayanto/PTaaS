import { h } from '../lib/dom.js';
import { Sidebar, closeMobileSidebar } from '../components/layout/sidebar.js';
import { Topbar } from '../components/layout/topbar.js';

/**
 * Main application layout shell with fixed sidebar + sticky topbar + scrollable content.
 * Built with pure CSS Grid and centralized container alignment.
 */
export function createAppLayout(root) {
  let shell = null;

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
      if (!shell) {
        shell = build();
        root.replaceChildren(shell.layout);
      }
      closeMobileSidebar();
      shell.sidebarHost.replaceChildren(Sidebar({ path }));
      shell.topbarHost.replaceChildren(Topbar({ path, route }));
      shell.outlet.replaceChildren(h('div', { class: 'page-enter' }, node));
    },
    reset() {
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

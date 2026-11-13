import { h, cx } from '../../lib/dom.js';

/**
 * Standard content container wrapper for all application pages.
 * Ensures breadcrumb, page header, toolbars, and content tables
 * share the exact same left/right alignment.
 * 
 * @param {'default' | 'wide' | 'full'} [variant='default']
 *   - default: max-width 1280px (standard dashboards, forms, tables)
 *   - wide: max-width 1440px (wide monitoring, large data grids)
 *   - full: max-width none (interactive editors, streaming desktop, terminals)
 */
export function PageContainer({ variant = 'default', class: extra = '' } = {}, ...children) {
  const variantClass = variant === 'full' ? 'max-w-full' : variant === 'wide' ? 'max-w-wide' : 'max-w-default';
  return h('div', { class: cx('page-container py-6', variantClass, extra) }, ...children);
}

import { h } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { button } from '../../components/ui/button.js';
import { emptyState } from '../../components/ui/empty-state.js';
import { PageContainer } from '../../components/layout/page-container.js';

export function forbiddenView(roles = []) {
  return PageContainer(
    { variant: 'default' },
    emptyState({
      icon: 'shield-alert',
      title: t('err.403.title') || 'Access Forbidden',
      description: t('err.403.desc', { roles: roles.map((r) => t(`role.${r}`)).join(', ') }) ||
        'You do not have the required permissions to access this administrative resource.',
      action: button({
        label: t('err.back') || 'Go to dashboard',
        href: '/dashboard',
        variant: 'primary',
        icon: 'arrow-left'
      })
    })
  );
}

export function notFoundView() {
  return PageContainer(
    { variant: 'default' },
    emptyState({
      icon: 'compass',
      title: t('err.404.title') || 'Page Not Found',
      description: t('err.404.desc') || 'The requested page or resource could not be found.',
      action: button({
        label: t('err.back') || 'Go to dashboard',
        href: '/dashboard',
        variant: 'secondary',
        icon: 'arrow-left'
      })
    })
  );
}

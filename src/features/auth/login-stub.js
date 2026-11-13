import { h } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { users } from '../../mock/users.js';
import { signInAs } from '../../lib/auth.js';
import { navigate } from '../../lib/router.js';
import { button } from '../../components/ui/button.js';

// Temporary: replaced by the real login + MFA flow in step 4.
export function LoginStubPage() {
  const demo = ['u-admin', 'u-sjohnson', 'u-jdoe'].map((id) => users.find((u) => u.id === id));
  return h('main', { id: 'main', class: 'grid min-h-screen place-items-center px-6' },
    h('div', { class: 'w-full max-w-sm' },
      h('h1', { class: 't-display' }, t('login.stub.title')),
      h('p', { class: 'mt-3 text-sm text-muted' }, t('login.stub.desc')),
      h('div', { class: 'mt-8 space-y-2' }, demo.map((user) =>
        button({
          label: `${user.name} · ${t(`role.${user.role}`)}`, variant: 'secondary', class: 'w-full justify-between',
          onClick: () => { signInAs(user.id); navigate('/dashboard'); }
        })))));
}

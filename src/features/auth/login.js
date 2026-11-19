import { h, icon } from '../../lib/dom.js';
import { t, getLang, toggleLang } from '../../lib/i18n.js';
import { createThemeToggle } from '../../components/layout/header/theme-toggle.js';
import { button } from '../../components/ui/button.js';
import { input, field } from '../../components/ui/input.js';
import { loginCredentials, completeFirstLogin } from '../../lib/auth.js';
import { navigate } from '../../lib/router.js';
import { loadMotionMini, isReducedMotion, EASINGS } from '../../lib/motion.js';

export function LoginPage() {
  let step = 'creds'; // 'creds' | 'setup'
  let targetUser = null;
  let emailDraft = '';
  let loading = false;
  let errorMsg = null;

  const container = h('div', { class: 'min-h-screen bg-canvas text-fg flex flex-col' });

  // Top minimal bar with back to home, lang and theme
  const topbar = h('header', { class: 'flex h-14 items-center justify-between px-6 border-b border-line' },
    h('a', { href: '/', 'data-link': true, class: 'flex items-center gap-2 font-semibold tracking-tight text-sm' },
      h('span', { class: 'flex h-6 w-6 items-center justify-center rounded-md bg-fg text-canvas' }, icon('chevron-right', 'w-4 h-4')),
      h('span', {}, 'PTaaS Cloud')),
    h('div', { class: 'flex items-center gap-2' },
      button({
        label: getLang().toUpperCase(), icon: 'languages', variant: 'ghost', size: 'sm',
        ariaLabel: t('top.lang'), onClick: () => { toggleLang(); render(); }
      }),
      createThemeToggle()));

  const formHost = h('div', { class: 'w-full max-w-sm' });

  // Right side product hero panel on desktop
  const visualPanel = h('div', { class: 'hidden lg:flex flex-1 flex-col justify-between border-l border-line bg-surface/40 p-12' },
    h('div', { class: 'space-y-4' },
      h('div', { class: 'inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted' },
        h('span', { class: 'h-1.5 w-1.5 rounded-full bg-accent' }),
        h('span', {}, 'Institutional Access Only')),
      h('h2', { class: 'text-2xl font-bold tracking-tight text-fg' }, 'Penetration Testing as a Service'),
      h('p', { class: 'text-sm text-muted leading-relaxed max-w-md' },
        'Browser-based virtual machines pre-configured with Kali Linux, isolated per-tenant VPCs, and automated resource quotas.')),
    h('div', { class: 'rounded-xl border border-line bg-surface p-4 font-mono text-xs text-muted space-y-2' },
      h('div', { class: 'flex items-center justify-between text-subtle text-[11px] pb-2 border-b border-line' },
        h('span', {}, 'auth.ptaas.internal:443'),
        h('span', { class: 'text-accent' }, 'HttpOnly Session Guard')),
      h('div', {}, '→ Verifying institutional credentials...'),
      h('div', {}, '→ Signing encrypted Guacamole lab token...'),
      h('div', { class: 'text-fg' }, '✓ Authenticated session ready for Kali Linux Lab.')),
    h('div', { class: 'text-xs text-subtle' },
      'Protected by role-based access control & encrypted Guacamole tunnel.'));

  const main = h('main', { class: 'flex-1 grid lg:grid-cols-[1fr_1.1fr]' },
    h('div', { class: 'grid place-items-center p-6 sm:p-12' }, formHost),
    visualPanel);

  container.append(topbar, main);

  function render() {
    formHost.replaceChildren();

    const alertBox = errorMsg
      ? h('div', { class: 'rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger', role: 'alert' }, errorMsg)
      : null;

    // STEP 1: Protected Credentials Form (no pre-filled or exposed default passwords)
    if (step === 'creds') {
      const emailInput = input({
        id: 'login-email',
        type: 'text',
        placeholder: 'name@example.edu',
        value: emailDraft,
        autocomplete: 'username',
        required: true,
        onInput: (v) => { emailDraft = v; }
      });
      const passInput = input({
        id: 'login-pass',
        type: 'password',
        placeholder: 'Enter your password',
        value: '',
        autocomplete: 'current-password',
        required: true
      });

      const submitBtn = button({
        label: loading ? 'Signing in…' : t('login.submit'),
        variant: 'primary',
        class: 'w-full',
        type: 'submit',
        disabled: loading
      });

      const form = h('form', { class: 'space-y-4', onSubmit: handleCredsSubmit },
        h('div', { class: 'space-y-1 mb-6' },
          h('h1', { class: 't-display' }, t('login.title')),
          h('p', { class: 'text-sm text-muted' }, t('login.desc'))),
        alertBox,
        field({ label: t('login.email'), id: 'login-email', control: emailInput }),
        field({ label: t('login.password'), id: 'login-pass', control: passInput }),
        h('div', { class: 'pt-2' }, submitBtn),
        h('p', { class: 'text-xs text-subtle pt-2 text-center' }, t('login.contact')));

      formHost.append(form);
      if (!isReducedMotion()) {
        loadMotionMini().then(({ animate }) => {
          const items = Array.from(form.children);
          items.forEach((item, idx) => {
            animate(item, { opacity: [0.001, 1], y: [8, 0] }, { duration: 0.28, delay: idx * 0.04, ease: EASINGS.expoOut });
          });
          if (alertBox) {
            animate(alertBox, { x: [0, -6, 6, -4, 4, 0] }, { duration: 0.3, ease: 'easeInOut' });
          }
        }).catch(() => {});
      }
      return;
    }

    // STEP 2: First-login mandatory password setup
    if (step === 'setup') {
      const newPassInput = input({
        id: 'setup-new',
        type: 'password',
        placeholder: 'Minimum 8 characters',
        autocomplete: 'new-password',
        required: true
      });
      const confirmInput = input({
        id: 'setup-confirm',
        type: 'password',
        placeholder: 'Re-enter new password',
        autocomplete: 'new-password',
        required: true
      });

      const saveBtn = button({
        label: loading ? 'Saving…' : t('login.setup.save'),
        variant: 'primary',
        class: 'w-full',
        type: 'submit',
        disabled: loading
      });

      const form = h('form', { class: 'space-y-4', onSubmit: handleSetupSubmit },
        h('div', { class: 'space-y-1 mb-6' },
          h('h1', { class: 't-display' }, t('login.setup.title')),
          h('p', { class: 'text-sm text-muted' }, t('login.setup.desc'))),
        h('div', { class: 'rounded-lg border border-line bg-surface p-3 text-xs space-y-1' },
          h('div', { class: 'text-subtle' }, 'Account:'),
          h('div', { class: 'font-medium text-fg' }, targetUser?.email || emailDraft)),
        alertBox,
        field({ label: t('login.setup.newpass'), id: 'setup-new', control: newPassInput }),
        field({ label: t('login.setup.confirm'), id: 'setup-confirm', control: confirmInput }),
        h('div', { class: 'pt-2' }, saveBtn));

      formHost.append(form);
    }
  }

  async function handleCredsSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('login-email')?.value.trim() || '';
    const pass = document.getElementById('login-pass')?.value || '';
    emailDraft = email;
    loading = true;
    errorMsg = null;
    render();

    const res = await loginCredentials(email, pass);
    loading = false;
    if (res.error === 'invalid') {
      errorMsg = t('login.err.invalid');
      render();
      return;
    }
    if (res.error === 'locked') {
      errorMsg = t('login.err.locked');
      render();
      return;
    }

    targetUser = res.user;
    if (res.mustChangePassword) {
      step = 'setup';
      render();
      return;
    }

    navigate('/dashboard');
  }

  async function handleSetupSubmit(e) {
    e.preventDefault();
    const p1 = document.getElementById('setup-new')?.value || '';
    const p2 = document.getElementById('setup-confirm')?.value || '';
    if (p1.length < 8) {
      errorMsg = 'Password must be at least 8 characters long.';
      render();
      return;
    }
    if (p1 !== p2) {
      errorMsg = t('login.err.match');
      render();
      return;
    }
    loading = true;
    errorMsg = null;
    render();

    const res = await completeFirstLogin(targetUser.id, p1);
    loading = false;
    if (res?.error) {
      errorMsg = res.error;
      render();
      return;
    }
    navigate('/dashboard');
  }

  render();
  return container;
}

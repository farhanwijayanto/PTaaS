import { h, icon } from '../../lib/dom.js';
import { t, getLang, toggleLang } from '../../lib/i18n.js';
import { toggleTheme } from '../../lib/theme.js';
import { createThemeToggle } from '../../components/layout/header/theme-toggle.js';
import { button } from '../../components/ui/button.js';
import { input, field } from '../../components/ui/input.js';
import { loginCredentials, verifyMfaCode, completeFirstLogin, signInAs } from '../../lib/auth.js';
import { navigate } from '../../lib/router.js';
import { users } from '../../mock/users.js';
import { isDemoMode } from '../../lib/demo-mode.js';
import { loadMotionMini, isReducedMotion, EASINGS } from '../../lib/motion.js';

export function LoginPage() {
  let step = 'creds'; // 'creds' | 'mfa' | 'setup'
  let targetUser = null;
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

  // Right side product hero panel on desktop (developer-tool minimalism)
  const visualPanel = h('div', { class: 'hidden lg:flex flex-1 flex-col justify-between border-l border-line bg-surface/40 p-12' },
    h('div', { class: 'space-y-4' },
      h('div', { class: 'inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted' },
        h('span', { class: 'h-1.5 w-1.5 rounded-full bg-accent' }),
        h('span', {}, 'Institutional Access Only')),
      h('h2', { class: 'text-2xl font-bold tracking-tight text-fg' }, 'Penetration Testing as a Service'),
      h('p', { class: 'text-sm text-muted leading-relaxed max-w-md' },
        'Browser-based virtual machines pre-configured with Kali Linux, isolated per-tenant VPCs, and automated resource quotas.')),
    // Terminal visual
    h('div', { class: 'rounded-xl border border-line bg-surface p-4 font-mono text-xs text-muted space-y-2' },
      h('div', { class: 'flex items-center justify-between text-subtle text-[11px] pb-2 border-b border-line' },
        h('span', {}, 'auth.keycloak.internal:8443'),
        h('span', { class: 'text-accent' }, 'OWASP CRS Active')),
      h('div', {}, '→ Initiating TLS 1.3 mutual handshake...'),
      h('div', {}, '→ Verifying student enrollment in cohort CS-401...'),
      h('div', { class: 'text-fg' }, '✓ MFA verified. Token issued for vpc-cs401-01.')),
    h('div', { class: 'text-xs text-subtle' },
      'Protected by Keycloak IAM & Open vSwitch VXLAN isolation.'));

  // Main split content
  const main = h('main', { class: 'flex-1 grid lg:grid-cols-[1fr_1.1fr]' },
    h('div', { class: 'grid place-items-center p-6 sm:p-12' }, formHost),
    visualPanel);

  container.append(topbar, main);

  function render() {
    formHost.replaceChildren();

    // STEP 1: Credentials Form
    if (step === 'creds') {
      const emailInput = input({
        id: 'login-email', type: 'text', placeholder: 'john.doe@example.edu',
        value: targetUser?.email || '', autocomplete: 'username', required: true
      });
      const passInput = input({
        id: 'login-pass', type: 'password', placeholder: '••••••••••••',
        value: '', autocomplete: 'current-password', required: true
      });

      const submitBtn = button({
        label: loading ? 'Signing in…' : t('login.submit'),
        variant: 'primary', class: 'w-full', type: 'submit', disabled: loading
      });

      const alertBox = errorMsg
        ? h('div', { class: 'rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger', role: 'alert' }, errorMsg)
        : null;

      const form = h('form', { class: 'space-y-4', onSubmit: handleCredsSubmit },
        h('div', { class: 'space-y-1 mb-6' },
          h('h1', { class: 't-display' }, t('login.title')),
          h('p', { class: 'text-sm text-muted' }, t('login.desc'))),
        alertBox,
        field({ label: t('login.email'), id: 'login-email', control: emailInput }),
        field({ label: t('login.password'), id: 'login-pass', control: passInput }),
        h('div', { class: 'pt-2' }, submitBtn),
        h('p', { class: 'text-xs text-subtle pt-2 text-center' }, t('login.contact')),
        // Quick demo switcher (shown only in Demo Mode)
        isDemoMode() ? h('div', { class: 'mt-8 pt-6 border-t border-line space-y-2' },
          h('p', { class: 'text-xs font-medium text-subtle' }, 'Demo accounts (fake, demo-only — password: Demo-Only-Change-Me-1! · MFA: 000000)'),
          h('div', { class: 'grid grid-cols-1 gap-1.5' },
            users.slice(0, 4).map((u) =>
              button({
                label: `${u.name} (${t(`role.${u.role}`)})`, variant: 'ghost', size: 'sm', class: 'justify-start text-xs h-8',
                onClick: () => {
                  emailInput.value = u.email;
                  passInput.value = 'Demo-Only-Change-Me-1!';
                  targetUser = u;
                  errorMsg = null;
                }
              })),
            button({
              label: 'Emma Thomas (Pending first-login demo)', variant: 'ghost', size: 'sm', class: 'justify-start text-xs h-8 text-[var(--warning-text)]',
              onClick: () => {
                const pendingUser = users.find((u) => u.id === 'u-ethomas');
                if (pendingUser) {
                  emailInput.value = pendingUser.email;
                  passInput.value = 'Demo-Only-Change-Me-1!';
                  targetUser = pendingUser;
                  errorMsg = null;
                }
              }
            }))) : null);

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

    // STEP 2: MFA TOTP Step
    if (step === 'mfa') {
      const totpInput = input({
        id: 'login-totp', type: 'text', placeholder: '123456',
        mono: true, autocomplete: 'one-time-code', required: true,
        attrs: { maxlength: '6', autofocus: true, class: 'text-center text-lg tracking-widest' }
      });

      const verifyBtn = button({
        label: loading ? 'Verifying…' : t('login.mfa.verify'),
        variant: 'primary', class: 'w-full', type: 'submit', disabled: loading
      });

      const form = h('form', { class: 'space-y-4', onSubmit: handleMfaSubmit },
        h('div', { class: 'space-y-1 mb-6' },
          h('h1', { class: 't-display' }, t('login.mfa.title')),
          h('p', { class: 'text-sm text-muted' }, t('login.mfa.desc'))),
        h('div', { class: 'rounded-lg border border-line bg-surface p-3 text-xs space-y-1' },
          h('div', { class: 'text-subtle' }, 'Signing in as:'),
          h('div', { class: 'font-medium text-fg' }, targetUser?.email),
          h('div', { class: 'font-mono text-accent text-[11px]' }, 'Keycloak TOTP Authenticator active')),
        errorMsg && h('div', { class: 'rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger', role: 'alert' }, errorMsg),
        field({ label: t('login.mfa.code'), id: 'login-totp', control: totpInput, hint: 'Demo: enter any 6 digits (e.g. 123456)' }),
        h('div', { class: 'pt-2 flex gap-2' },
          button({ label: t('common.cancel'), variant: 'secondary', onClick: () => { step = 'creds'; errorMsg = null; render(); } }),
          verifyBtn));

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

    // STEP 3: First-login force password change + MFA enrollment
    if (step === 'setup') {
      const newPassInput = input({ id: 'setup-new', type: 'password', required: true });
      const confirmInput = input({ id: 'setup-confirm', type: 'password', required: true });

      const saveBtn = button({
        label: loading ? 'Saving…' : t('login.setup.save'),
        variant: 'primary', class: 'w-full', type: 'submit', disabled: loading
      });

      const form = h('form', { class: 'space-y-4', onSubmit: handleSetupSubmit },
        h('div', { class: 'space-y-1 mb-6' },
          h('h1', { class: 't-display' }, t('login.setup.title')),
          h('p', { class: 'text-sm text-muted' }, t('login.setup.desc'))),
        errorMsg && h('div', { class: 'rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger', role: 'alert' }, errorMsg),
        field({ label: t('login.setup.newpass'), id: 'setup-new', control: newPassInput }),
        field({ label: t('login.setup.confirm'), id: 'setup-confirm', control: confirmInput }),
        h('div', { class: 'pt-2' }, saveBtn));

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
  }

  async function handleCredsSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;
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
    step = 'mfa';
    render();
  }

  async function handleMfaSubmit(e) {
    e.preventDefault();
    const code = document.getElementById('login-totp').value.trim();
    loading = true;
    errorMsg = null;
    render();

    const res = await verifyMfaCode(targetUser.id, code);
    loading = false;
    if (res.error) {
      errorMsg = t('login.err.mfa');
      render();
      return;
    }
    if (res.mustChangePassword) {
      step = 'setup';
      render();
      return;
    }

    navigate('/dashboard');
  }

  async function handleSetupSubmit(e) {
    e.preventDefault();
    const p1 = document.getElementById('setup-new').value;
    const p2 = document.getElementById('setup-confirm').value;
    if (p1 !== p2) {
      errorMsg = t('login.err.match');
      render();
      return;
    }
    loading = true;
    errorMsg = null;
    render();

    await completeFirstLogin(targetUser.id, p1);
    loading = false;
    navigate('/dashboard');
  }

  render();
  return container;
}

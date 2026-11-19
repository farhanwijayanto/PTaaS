import { h, icon } from '../../lib/dom.js';
import { t } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { on } from '../../lib/events.js';
import { onCleanup } from '../../lib/router.js';
import { useAuth } from '../../lib/auth.js';
import { timeAgo, initials } from '../../lib/format.js';
import { button } from '../../components/ui/button.js';
import { searchInput, select, input, field } from '../../components/ui/input.js';
import { table } from '../../components/ui/table.js';
import { badge } from '../../components/ui/badge.js';
import { tabs } from '../../components/ui/tabs.js';
import { dropdown } from '../../components/ui/dropdown.js';
import { skeletonRows } from '../../components/ui/skeleton.js';
import { emptyState, errorState } from '../../components/ui/empty-state.js';
import { confirmDialog, openDialog } from '../../components/ui/dialog.js';
import { openDrawer } from '../../components/ui/drawer.js';
import { toast } from '../../components/ui/toast.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { cohorts } from '../../mock/users.js';

export function UsersPage() {
  const { role } = useAuth();
  const isInstructor = role === 'instructor';

  let allUsers = [];
  let state = 'loading';
  let query = '';
  let activeTab = 'all';
  let cohortFilter = 'all';

  const host = h('div', { 'aria-live': 'polite' });

  // Search & Filter controls
  const search = searchInput({
    placeholder: t('users.search'), ariaLabel: t('users.search'),
    onInput: (v) => { query = v.trim().toLowerCase(); draw(); }
  });

  const cohortSelect = select({
    ariaLabel: t('users.col.cohort'), value: 'all',
    onChange: (v) => { cohortFilter = v; draw(); },
    options: [
      { value: 'all', label: t('tenant.all') },
      ...cohorts.map((c) => ({ value: c.id, label: c.name }))
    ]
  });

  // Action buttons: Create user + Bulk import
  const createBtn = button({
    label: isInstructor ? t('nav.students') : t('users.new'),
    icon: 'plus', variant: 'primary', onClick: openCreateUserDrawer
  });

  const importBtn = button({
    label: t('users.import'), icon: 'upload', variant: 'secondary',
    onClick: openBulkImportModal
  });

  // Tabs: All, Active, Pending approval (with badge), Suspended
  const userTabs = tabs({
    ariaLabel: 'User status tabs',
    value: activeTab,
    onChange: (v) => { activeTab = v; draw(); },
    items: [
      { id: 'all', label: t('users.tab.all') },
      { id: 'active', label: t('users.tab.active') },
      { id: 'pending', label: t('users.tab.pending'), count: 0 },
      { id: 'suspended', label: t('users.tab.suspended') }
    ]
  });

  function getColumns() {
    return [
      {
        key: 'name', label: t('users.col.name'),
        render: (u) => h('div', { class: 'flex items-center gap-3 cursor-pointer', onClick: () => openUserDetailDrawer(u) },
          h('span', { class: 'flex h-8 w-8 items-center justify-center rounded-full bg-raised text-xs font-semibold text-fg' }, initials(u.name)),
          h('div', { class: 'min-w-0' },
            h('div', { class: 'truncate font-medium text-fg hover:text-accent transition-colors' }, u.name),
            h('div', { class: 't-caption' }, u.email)))
      },
      {
        key: 'role', label: t('users.col.role'),
        render: (u) => badge({
          label: t(`role.${u.role}`),
          tone: u.role === 'admin' ? 'accent' : u.role === 'instructor' ? 'warn' : 'neutral'
        })
      },
      {
        key: 'cohort', label: t('users.col.cohort'), class: 'hidden md:table-cell',
        render: (u) => h('span', { class: 'font-mono text-muted text-xs' }, u.cohort || u.cohorts?.join(', ') || '—')
      },
      {
        key: 'status', label: t('users.col.status'),
        render: (u) => {
          if (u.status === 'pending') return badge({ label: t('users.status.pending'), tone: 'warn', dot: true });
          if (u.status === 'suspended') return badge({ label: t('users.status.suspended'), tone: 'danger' });
          return badge({ label: t('users.status.active'), tone: 'accent' });
        }
      },
      {
        key: 'quota', label: t('users.col.quota'), class: 'hidden lg:table-cell',
        render: (u) => h('span', { class: 'font-mono text-xs text-muted' }, `${u.quota?.vcpu ?? 8} vCPU · ${u.quota?.ram ?? 16} GB`)
      },
      {
        key: 'lastLogin', label: t('users.col.lastLogin'), class: 'hidden sm:table-cell',
        render: (u) => h('span', { class: 't-caption' }, u.lastLogin ? timeAgo(u.lastLogin) : 'Never')
      },
      {
        key: 'actions', label: t('users.col.actions'), srOnly: true, class: 'w-24 text-right',
        render: (u) => {
          if (u.status === 'pending') {
            return h('div', { class: 'flex justify-end gap-1' },
              button({
                icon: 'check', variant: 'ghost', size: 'icon', ariaLabel: t('users.act.approve'),
                title: t('users.act.approve'), onClick: () => handleUserAction(u, 'approve')
              }),
              button({
                icon: 'x', variant: 'ghost', size: 'icon', ariaLabel: t('users.act.reject'),
                title: t('users.act.reject'), class: 'text-danger hover:text-danger', onClick: () => handleUserAction(u, 'reject')
              }));
          }
          const more = h('button', {
            type: 'button', 'aria-label': `${t('vm.act.more')}: ${u.name}`,
            class: 'flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-fg'
          }, icon('ellipsis', 'w-4 h-4'));
          return h('div', { class: 'flex justify-end items-center gap-1' },
            button({
              icon: 'key-round', variant: 'ghost', size: 'icon',
              ariaLabel: `Set password: ${u.name}`,
              title: 'Set / Change Password',
              onClick: () => openSetPasswordModal(u)
            }),
            dropdown({ trigger: more, items: () => getUserMenuItems(u) }));
        }
      }
    ];
  }

  function getUserMenuItems(u) {
    const isSuspended = u.status === 'suspended';
    return [
      { label: t('users.act.detail'), icon: 'user', onSelect: () => openUserDetailDrawer(u) },
      { label: 'Edit User', icon: 'pencil', onSelect: () => openEditUserModal(u) },
      { label: 'Set / Change Password', icon: 'key-round', onSelect: () => openSetPasswordModal(u) },
      { type: 'separator' },
      isSuspended
        ? { label: t('users.act.activate'), icon: 'check-circle', onSelect: () => handleUserAction(u, 'activate') }
        : { label: t('users.act.suspend'), icon: 'ban', danger: true, onSelect: () => handleUserAction(u, 'suspend') },
      { label: 'Generate Random Password', icon: 'refresh-cw', onSelect: () => handleUserAction(u, 'resetPass') },
      { type: 'separator' },
      { label: t('users.act.delete'), icon: 'trash-2', danger: true, onSelect: () => handleDeleteUser(u) }
    ];
  }

  function openSetPasswordModal(u) {
    let newPassword = '';
    let confirmPassword = '';
    let showPlain = false;
    let requireChange = false;
    let errorText = null;
    let dialog;

    const errBox = h('div', { class: 'hidden rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger', role: 'alert' });
    const passInput = input({
      id: `set-pass-${u.id}`,
      type: 'password',
      placeholder: 'Minimal 6 karakter',
      autocomplete: 'new-password',
      onInput: (v) => { newPassword = v; }
    });
    const confirmInput = input({
      id: `confirm-pass-${u.id}`,
      type: 'password',
      placeholder: 'Ulangi password baru',
      autocomplete: 'new-password',
      onInput: (v) => { confirmPassword = v; }
    });

    const showToggle = h('input', {
      type: 'checkbox',
      id: `show-pass-${u.id}`,
      class: 'rounded border-line',
      onChange: (e) => {
        showPlain = e.target.checked;
        passInput.type = showPlain ? 'text' : 'password';
        confirmInput.type = showPlain ? 'text' : 'password';
      }
    });

    const mustChangeToggle = h('input', {
      type: 'checkbox',
      id: `must-change-${u.id}`,
      class: 'rounded border-line',
      onChange: (e) => { requireChange = e.target.checked; }
    });

    const savePassword = async () => {
      if (newPassword.length < 6) {
        errorText = 'Password minimal 6 karakter.';
        errBox.textContent = errorText;
        errBox.classList.remove('hidden');
        return;
      }
      if (newPassword !== confirmPassword) {
        errorText = 'Konfirmasi password tidak cocok.';
        errBox.textContent = errorText;
        errBox.classList.remove('hidden');
        return;
      }
      try {
        await api.users.setPassword(u.id, newPassword, requireChange);
        dialog.close();
        toast({ title: 'Password diperbarui', description: `Password untuk ${u.email} berhasil diubah.`, kind: 'success' });
        load({ silent: true });
      } catch (err) {
        errBox.textContent = err.message || 'Gagal mengubah password.';
        errBox.classList.remove('hidden');
      }
    };

    dialog = openDialog({
      title: `Set Password — ${u.name}`,
      description: `Atur password login baru untuk ${u.email}.`,
      body: h('div', { class: 'space-y-4' },
        errBox,
        field({ label: 'New Password', id: `set-pass-${u.id}`, control: passInput }),
        field({ label: 'Confirm Password', id: `confirm-pass-${u.id}`, control: confirmInput }),
        h('div', { class: 'space-y-2 pt-1 text-xs text-muted' },
          h('label', { for: `show-pass-${u.id}`, class: 'flex items-center gap-2 cursor-pointer' }, showToggle, 'Tampilkan password'),
          h('label', { for: `must-change-${u.id}`, class: 'flex items-center gap-2 cursor-pointer' }, mustChangeToggle, 'Wajibkan user ganti password saat login berikutnya')
        )
      ),
      actions: [
        button({ label: t('common.cancel'), variant: 'secondary', onClick: () => dialog.close() }),
        button({ label: 'Save Password', variant: 'primary', onClick: savePassword })
      ]
    });
  }

  function openEditUserModal(u) {
    const draft = {
      name: u.name || '',
      email: u.email || '',
      role: u.role || 'student',
      cohort: u.cohort || cohorts[0]?.id || 'CS-401',
      status: u.status || 'active',
      password: ''
    };
    let dialog;
    const errBox = h('div', { class: 'hidden rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-xs text-danger', role: 'alert' });

    const nameInp = input({ id: `edit-name-${u.id}`, value: draft.name, onInput: (v) => { draft.name = v; } });
    const emailInp = input({ id: `edit-email-${u.id}`, type: 'email', value: draft.email, onInput: (v) => { draft.email = v; } });
    const roleSel = select({
      ariaLabel: 'Role',
      value: draft.role,
      onChange: (v) => { draft.role = v; },
      options: isInstructor
        ? [{ value: 'student', label: t('role.student') }]
        : [
            { value: 'student', label: t('role.student') },
            { value: 'instructor', label: t('role.instructor') },
            { value: 'admin', label: t('role.admin') }
          ]
    });
    const cohortSel = select({
      ariaLabel: 'Cohort',
      value: draft.cohort,
      onChange: (v) => { draft.cohort = v; },
      options: cohorts.map((c) => ({ value: c.id, label: `${c.id} - ${c.name}` }))
    });
    const statusSel = select({
      ariaLabel: 'Status',
      value: draft.status,
      onChange: (v) => { draft.status = v; },
      options: [
        { value: 'active', label: 'Active' },
        { value: 'pending', label: 'Pending' },
        { value: 'suspended', label: 'Suspended' }
      ]
    });
    const passInp = input({
      id: `edit-pass-${u.id}`,
      type: 'password',
      placeholder: 'Kosongkan jika tidak ingin mengubah password',
      autocomplete: 'new-password',
      onInput: (v) => { draft.password = v; }
    });

    const saveChanges = async () => {
      if (!draft.name.trim() || !draft.email.trim()) {
        errBox.textContent = 'Nama dan email wajib diisi.';
        errBox.classList.remove('hidden');
        return;
      }
      if (draft.password && draft.password.length < 6) {
        errBox.textContent = 'Password baru minimal 6 karakter.';
        errBox.classList.remove('hidden');
        return;
      }
      try {
        const updates = {
          name: draft.name.trim(),
          email: draft.email.trim(),
          role: draft.role,
          cohort: draft.cohort,
          status: draft.status
        };
        if (draft.password) {
          updates.password = draft.password;
          updates.mustChangePassword = false;
        }
        await api.users.update(u.id, updates);
        dialog.close();
        toast({ title: 'User diperbarui', description: `Perubahan untuk ${draft.email} disimpan.`, kind: 'success' });
        load({ silent: true });
      } catch (err) {
        errBox.textContent = err.message || 'Gagal menyimpan perubahan.';
        errBox.classList.remove('hidden');
      }
    };

    dialog = openDialog({
      title: `Edit User — ${u.name}`,
      description: 'Ubah data akun, role, status, atau atur password baru.',
      body: h('div', { class: 'space-y-3' },
        errBox,
        field({ label: 'Full Name', id: `edit-name-${u.id}`, control: nameInp }),
        field({ label: 'Email', id: `edit-email-${u.id}`, control: emailInp }),
        h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-3' },
          field({ label: 'Role', id: `edit-role-${u.id}`, control: roleSel }),
          field({ label: 'Status', id: `edit-status-${u.id}`, control: statusSel })
        ),
        field({ label: 'Cohort', id: `edit-cohort-${u.id}`, control: cohortSel }),
        field({ label: 'New Password', id: `edit-pass-${u.id}`, optional: 'optional', control: passInp })
      ),
      actions: [
        button({ label: t('common.cancel'), variant: 'secondary', onClick: () => dialog.close() }),
        button({ label: 'Save Changes', variant: 'primary', onClick: saveChanges })
      ]
    });
  }

  async function handleUserAction(u, action) {
    try {
      const res = await api.users.action(u.id, action);
      if (action === 'resetPass' && res?.tempPassword) {
        openDialog({
          title: t('users.act.resetPass'),
          description: `Temporary password for ${u.name}:`,
          body: h('div', { class: 'p-3 bg-surface rounded-lg border border-line font-mono text-center text-accent text-sm select-all' }, res.tempPassword)
        });
      } else {
        toast({ title: t(`users.act.${action}`), kind: action === 'reject' || action === 'suspend' ? 'error' : 'success' });
      }
      load({ silent: true });
    } catch (err) {
      toast({ title: t('common.error'), description: err.message, kind: 'error' });
    }
  }

  async function handleDeleteUser(u) {
    const ok = await confirmDialog({
      title: t('users.delete.title', { name: u.name }),
      description: t('users.delete.desc'),
      confirmText: u.email,
      danger: true
    });
    if (!ok) return;
    try {
      await api.users.delete(u.id);
      toast({ title: t('users.act.delete'), kind: 'info' });
      load({ silent: true });
    } catch (err) {
      toast({ title: t('common.error'), description: err.message, kind: 'error' });
    }
  }

  function draw() {
    if (state === 'loading') return host.replaceChildren(skeletonRows(5));
    if (state === 'error') return host.replaceChildren(errorState({ onRetry: load }));

    // Count pending users for tab badge
    const pendingCount = allUsers.filter((u) => u.status === 'pending').length;
    userTabs.setCount('pending', pendingCount);

    const rows = allUsers.filter((u) => {
      if (activeTab === 'active' && u.status !== 'active') return false;
      if (activeTab === 'pending' && u.status !== 'pending') return false;
      if (activeTab === 'suspended' && u.status !== 'suspended') return false;
      if (cohortFilter !== 'all' && u.cohort !== cohortFilter && !u.cohorts?.includes(cohortFilter)) return false;
      if (query && !u.name.toLowerCase().includes(query) && !u.email.toLowerCase().includes(query) && !(u.nim && u.nim.includes(query))) return false;
      return true;
    });

    if (!rows.length) {
      return host.replaceChildren(emptyState({
        icon: 'users',
        title: activeTab === 'pending' ? 'No pending approvals' : 'No users match criteria',
        description: 'Try adjusting your filters or search terms.'
      }));
    }

    host.replaceChildren(table({ columns: getColumns(), rows, caption: t('users.title') }));
  }

  async function load({ silent = false } = {}) {
    if (!silent) { state = 'loading'; draw(); }
    try {
      allUsers = await api.users.list();
      state = 'ready';
    } catch {
      if (silent) return;
      state = 'error';
    }
    draw();
  }

  // 2-Step Create User Drawer
  function openCreateUserDrawer() {
    let currentStep = 1;
    const formData = {
      name: '',
      email: '',
      idNum: '',
      password: '',
      mustChangePassword: false,
      role: isInstructor ? 'student' : 'student',
      cohort: cohorts[0]?.id || '',
      quota: { vcpu: 8, ram: 16, storage: 150, vms: 4 },
      idleTimeoutMin: 60,
      expiry: '2026-07-31'
    };

    let drawer;

    function renderDrawerStep1() {
      const nameInp = input({ id: 'u-name', placeholder: 'Lucas Scott', value: formData.name, onInput: (v) => { formData.name = v; } });
      const emailInp = input({ id: 'u-email', type: 'email', placeholder: 'lucas.scott@example.edu', value: formData.email, onInput: (v) => { formData.email = v; } });
      const idInp = input({ id: 'u-nim', placeholder: 'STU-0016', value: formData.idNum, onInput: (v) => { formData.idNum = v; } });
      const passInp = input({
        id: 'u-password',
        type: 'password',
        placeholder: 'Kosongkan untuk generate otomatis',
        value: formData.password,
        autocomplete: 'new-password',
        onInput: (v) => { formData.password = v; }
      });
      const forceChangeChk = h('input', {
        id: 'u-force-change',
        type: 'checkbox',
        checked: formData.mustChangePassword,
        class: 'rounded border-line',
        onChange: (e) => { formData.mustChangePassword = e.target.checked; }
      });

      const roleSelect = select({
        ariaLabel: t('users.create.role'), value: formData.role,
        onChange: (v) => { formData.role = v; },
        options: isInstructor
          ? [{ value: 'student', label: t('role.student') }]
          : [
              { value: 'student', label: t('role.student') },
              { value: 'instructor', label: t('role.instructor') },
              { value: 'admin', label: t('role.admin') }
            ]
      });

      const cohortSelect = select({
        ariaLabel: t('users.create.cohort'), value: formData.cohort,
        onChange: (v) => { formData.cohort = v; },
        options: cohorts.map((c) => ({ value: c.id, label: `${c.id} - ${c.name}` }))
      });

      return h('div', { class: 'space-y-4' },
        h('div', { class: 'text-xs text-subtle font-mono' }, t('users.create.step1')),
        field({ label: t('users.create.name'), id: 'u-name', control: nameInp }),
        field({ label: t('users.create.email'), id: 'u-email', control: emailInp }),
        field({ label: 'Initial Password', id: 'u-password', optional: 'optional', hint: 'Minimal 6 karakter, atau kosongkan untuk auto-generate.', control: passInp }),
        h('label', { for: 'u-force-change', class: 'flex items-center gap-2 text-xs text-muted cursor-pointer' },
          forceChangeChk,
          'Wajibkan ganti password pada login pertama'
        ),
        field({ label: t('users.create.idNum'), id: 'u-nim', control: idInp }),
        field({ label: t('users.create.role'), id: 'u-role', control: roleSelect }),
        field({ label: t('users.create.cohort'), id: 'u-cohort', control: cohortSelect }));
    }

    function renderDrawerStep2() {
      const tierSelect = select({
        ariaLabel: t('users.create.tier'), value: 'standard',
        onChange: (v) => {
          if (v === 'lite') formData.quota = { vcpu: 2, ram: 4, storage: 50, vms: 2 };
          else if (v === 'performance') formData.quota = { vcpu: 16, ram: 32, storage: 300, vms: 6 };
          else formData.quota = { vcpu: 8, ram: 16, storage: 150, vms: 4 };
        },
        options: [
          { value: 'standard', label: 'Standard Lab (8 vCPU · 16 GB · 150 GB)' },
          { value: 'lite', label: 'Lightweight (2 vCPU · 4 GB · 50 GB)' },
          { value: 'performance', label: 'Performance / CTF (16 vCPU · 32 GB · 300 GB)' }
        ]
      });

      const timeoutSelect = select({
        ariaLabel: t('users.create.timeout'), value: String(formData.idleTimeoutMin),
        onChange: (v) => { formData.idleTimeoutMin = Number(v); },
        options: [
          { value: '30', label: '30 minutes' },
          { value: '60', label: '60 minutes (default)' },
          { value: '120', label: '120 minutes' }
        ]
      });

      const expiryInp = input({
        id: 'u-exp', type: 'date', value: formData.expiry,
        onInput: (v) => { formData.expiry = v; }
      });

      return h('div', { class: 'space-y-4' },
        h('div', { class: 'text-xs text-subtle font-mono' }, t('users.create.step2')),
        field({ label: t('users.create.tier'), id: 'u-tier', control: tierSelect }),
        field({ label: t('users.create.timeout'), id: 'u-timeout', control: timeoutSelect }),
        field({ label: t('users.create.expiry'), id: 'u-exp', control: expiryInp }));
    }

    function updateDrawer() {
      drawer.setBody(currentStep === 1 ? renderDrawerStep1() : renderDrawerStep2());
      drawer.setFooter(
        h('div', { class: 'flex justify-between items-center' },
          currentStep === 2
            ? button({ label: 'Back', variant: 'secondary', onClick: () => { currentStep = 1; updateDrawer(); } })
            : h('span', {}),
          h('div', { class: 'flex gap-2' },
            button({ label: t('common.cancel'), variant: 'secondary', onClick: () => drawer.close() }),
            currentStep === 1
              ? button({ label: 'Next: Policy →', variant: 'primary', onClick: () => { currentStep = 2; updateDrawer(); } })
              : button({ label: t('users.create.submit'), variant: 'primary', onClick: submitCreateUser }))));
    }

    async function submitCreateUser() {
      if (!formData.name || !formData.email) {
        toast({ title: 'Validation error', description: 'Name and email are required.', kind: 'error' });
        return;
      }
      try {
        const res = await api.users.create(formData);
        drawer.close();
        // Show temporary password modal
        openDialog({
          title: t('users.create.success'),
          description: t('users.create.tempNote'),
          body: h('div', { class: 'space-y-3' },
            h('div', { class: 'text-xs text-subtle' }, t('users.create.tempPass')),
            h('div', { class: 'flex items-center justify-between p-3 bg-surface rounded-lg border border-line font-mono text-accent text-sm' },
              h('span', { class: 'select-all' }, res.tempPassword),
              button({
                icon: 'copy', variant: 'ghost', size: 'sm', ariaLabel: 'Copy',
                onClick: () => { navigator.clipboard?.writeText(res.tempPassword); toast({ title: 'Copied password' }); }
              }))),
          actions: [button({ label: t('common.close'), variant: 'primary', onClick: () => document.querySelector('[role="dialog"]')?.remove() })]
        });
        load({ silent: true });
      } catch (err) {
        toast({ title: t('common.error'), description: err.message, kind: 'error' });
      }
    }

    drawer = openDrawer({
      title: t('users.create.title'),
      description: t('users.create.desc'),
      body: renderDrawerStep1(),
      footer: null
    });
    updateDrawer();
  }

  // Bulk CSV Import Modal
  function openBulkImportModal() {
    const defaultCsv =
`Name,Email,StudentID,Cohort
Lucas Scott,lucas.scott@example.edu,STU-0016,CS-401
Grace Hopper,grace.hopper@example.edu,STU-0017,CS-401
Alan Turing,alan.turing@example.edu,STU-0018,SEC-301`;

    const area = h('textarea', {
      class: 'h-40 w-full rounded-lg border border-line bg-surface p-3 font-mono text-xs text-fg leading-relaxed focus:outline-none focus:border-line-strong',
      placeholder: 'Name,Email,StudentID,Cohort'
    });
    area.value = defaultCsv;

    let dialog;
    const parseAndImport = async () => {
      const lines = area.value.trim().split('\n').filter(Boolean);
      if (lines.length <= 1) return;
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const [name, email, nim, cohort] = lines[i].split(',').map((s) => s.trim());
        if (name && email) rows.push({ name, email, nim, cohort: cohort || cohorts[0].id });
      }
      try {
        await api.users.bulkImport(rows);
        dialog.close();
        toast({ title: t('users.import.confirm', { n: rows.length }), kind: 'success' });
        load({ silent: true });
      } catch (err) {
        toast({ title: t('common.error'), description: err.message, kind: 'error' });
      }
    };

    dialog = openDialog({
      title: t('users.import.title'),
      description: t('users.import.desc'),
      body: h('div', { class: 'space-y-3' },
        area,
        h('p', { class: 'text-xs text-subtle' }, 'Valid rows will be marked as Pending until first login.')),
      actions: [
        button({ label: t('common.cancel'), variant: 'secondary', onClick: () => dialog.close() }),
        button({ label: 'Import students', variant: 'primary', onClick: parseAndImport })
      ]
    });
  }

  // User Detail Drawer
  function openUserDetailDrawer(u) {
    const isSuspended = u.status === 'suspended';
    openDrawer({
      title: u.name,
      description: `${t(`role.${u.role}`)} · ${u.cohort || u.cohorts?.join(', ') || 'No cohort'}`,
      body: h('div', { class: 'space-y-6 text-sm' },
        h('div', { class: 'space-y-2' },
          h('h4', { class: 'text-xs font-semibold text-subtle uppercase' }, 'Account Overview'),
          h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-2 text-xs' },
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Email:'), h('span', { class: 'font-mono' }, u.email)),
            u.nim && h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Student NIM:'), h('span', { class: 'font-mono' }, u.nim)),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Status:'), h('span', { class: 'font-medium' }, u.status)),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Last Active:'), h('span', {}, u.lastLogin ? timeAgo(u.lastLogin) : 'Never')))),
        h('div', { class: 'space-y-2' },
          h('h4', { class: 'text-xs font-semibold text-subtle uppercase' }, 'Resource Quota Limits'),
          h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-2 text-xs font-mono' },
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'vCPU Core:'), h('span', {}, `${u.quota?.vcpu ?? 8} vCPU`)),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'RAM Memory:'), h('span', {}, `${u.quota?.ram ?? 16} GB`)),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'NVMe Disk:'), h('span', {}, `${u.quota?.storage ?? 150} GB`)),
            h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Auto-stop Timeout:'), h('span', {}, `${u.idleTimeoutMin ?? 60} minutes`)))),
        u.role === 'student' && h('div', { class: 'space-y-2' },
          h('h4', { class: 'text-xs font-semibold text-subtle uppercase' }, 'Self-Service VM Limit Override'),
          h('div', { class: 'rounded-xl border border-line bg-surface p-4 flex items-center justify-between text-xs' },
            h('div', {},
              h('span', { class: 'text-fg font-medium block' }, 'VM Slot Quota'),
              h('span', { class: 'text-muted text-[11px]' }, 'Default is 3 VMs per student')
            ),
            h('div', { class: 'flex items-center gap-2' },
              h('select', {
                id: `vm-limit-${u.id}`,
                class: 'rounded-lg border border-line bg-canvas p-1.5 text-xs font-mono text-fg outline-none focus:border-accent',
                value: String(u.maxSelfServiceVms || 3)
              },
                [1, 2, 3, 4, 5, 6].map(n => h('option', { value: String(n), selected: n === (u.maxSelfServiceVms || 3) }, `${n} VMs`))
              ),
              button({
                label: 'Save',
                size: 'xs',
                variant: 'primary',
                onClick: async () => {
                  const sel = document.getElementById(`vm-limit-${u.id}`);
                  if (sel) {
                    await api.policies.setUserLimit(u.id, Number(sel.value));
                    u.maxSelfServiceVms = Number(sel.value);
                    toast({ title: 'Limit updated', description: `Set ${u.name} limit to ${sel.value} VMs`, kind: 'success' });
                  }
                }
              })
            )
          )
        ),
        h('div', { class: 'pt-4 border-t border-line space-y-2' },
          h('h4', { class: 'text-xs font-semibold text-subtle uppercase mb-2' }, 'Administrative Actions'),
          h('div', { class: 'grid grid-cols-2 gap-2' },
            button({ label: 'Set Password', icon: 'key-round', variant: 'primary', size: 'sm', onClick: () => openSetPasswordModal(u) }),
            button({ label: 'Edit User', icon: 'pencil', variant: 'secondary', size: 'sm', onClick: () => openEditUserModal(u) }),
            button({ label: 'Random Reset', variant: 'secondary', size: 'sm', onClick: () => handleUserAction(u, 'resetPass') }),
            button({
              label: isSuspended ? t('users.act.activate') : t('users.act.suspend'),
              variant: isSuspended ? 'secondary' : 'danger-ghost', size: 'sm',
              onClick: () => handleUserAction(u, isSuspended ? 'activate' : 'suspend')
            }),
            button({ label: t('users.act.delete'), variant: 'danger-ghost', size: 'sm', onClick: () => handleDeleteUser(u) }))))
    });
  }

  onCleanup(on('users:changed', () => load({ silent: true })));
  load();

  return PageContainer({ variant: 'default' },
    pageHeader({
      title: isInstructor ? t('nav.students') : t('users.title'),
      description: t('users.desc'),
      actions: h('div', { class: 'flex gap-2' }, importBtn, createBtn)
    }),
    userTabs,
    h('div', { class: 'flex flex-wrap items-center gap-2 mb-4' }, search, cohortSelect),
    host);
}

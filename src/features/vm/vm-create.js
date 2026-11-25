import { h, cx } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { on } from '../../lib/events.js';
import { t } from '../../lib/i18n.js';
import { navigate, onCleanup } from '../../lib/router.js';
import { subscribeVms, getVmState, refreshVms } from '../../lib/vm-store.js';
import { isDemoMode } from '../../lib/demo-mode.js';
import { loadMotionMini, isReducedMotion, EASINGS } from '../../lib/motion.js';
import { button } from '../../components/ui/button.js';
import { input, field } from '../../components/ui/input.js';
import { badge } from '../../components/ui/badge.js';
import { toast } from '../../components/ui/toast.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { openVmRequestModal } from './vm-request-modal.js';

const VM_NAME_REGEX = /^[a-z][a-z0-9-]{2,30}$/;

const PROGRESS_STAGES = [
  { id: 'queued', key: 'vm.create.stage.queued' },
  { id: 'creating', key: 'vm.create.stage.creating' },
  { id: 'starting', key: 'vm.create.stage.starting' },
  { id: 'waiting_for_desktop', key: 'vm.create.stage.waiting_for_desktop' },
  { id: 'ready', key: 'vm.create.stage.ready' },
];

const STAGE_ORDER = {
  queued: 0,
  creating: 1,
  starting: 2,
  waiting_for_desktop: 3,
  ready: 4,
};

const DEFAULT_CATALOG = [
  {
    id: 'kali-2024.3',
    os: 'kali',
    label: 'Kali Linux 2024.3',
    description: 'XFCE Desktop, RDP & SSH ready',
    available: true,
    ready: true,
    tools: ['Nmap', 'Metasploit', 'Burp Suite', 'Wireshark', 'SQLmap', 'Hydra', 'John the Ripper'],
  },
  {
    id: 'parrot-6.1',
    os: 'parrot',
    label: 'Parrot Security 6.1',
    description: 'MATE Desktop, coming soon',
    available: false,
    ready: false,
    tools: ['Nmap', 'Wireshark', 'SQLmap'],
  },
  {
    id: 'ubuntu-24.04',
    os: 'ubuntu',
    label: 'Ubuntu 24.04 LTS',
    description: 'GNOME / Server, coming soon',
    available: false,
    ready: false,
    tools: ['Nmap', 'curl'],
  },
];

function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `vm-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function sanitizeTenantSlug(raw) {
  return String(raw || 'cs-401').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

export function VmCreatePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const tenant = user?.cohort || (Array.isArray(user?.cohorts) ? user.cohorts[0] : null) || 'CS-401';
  const tenantNetworkName = `ptaas-lab-${sanitizeTenantSlug(tenant)}`;

  let step = 1; // 1: OS, 2: Compute, 3: Network, 4: Tools, 5: Confirm & Boot
  let createdVm = null;
  let launching = false;
  let cancelling = false;
  let pullingImage = false;
  let activeIdempotencyKey = null;

  // Image catalog health state
  let catalogLoading = true;
  let catalogImages = DEFAULT_CATALOG;
  let demoMode = isDemoMode();
  let dockerReachable = true;

  // Live provisioning progress state
  let creationStage = null; // null | 'queued' | 'creating' | 'starting' | 'waiting_for_desktop' | 'ready' | 'failed' | 'cancelled'
  let creationError = null; // { code, message } | null
  let creationLogs = [];
  let creationStartedMs = 0;
  let elapsedSeconds = 0;
  let elapsedTimer = null;
  let pollWatchTimer = null;
  let readyToasted = false;

  const form = {
    name: `kali-lab-${String(Math.floor(Math.random() * 89) + 10)}`,
    imageId: 'kali-2024.3',
    os: 'kali',
    vcpu: 2,
    ram: 4,
    disk: 30,
    vpc: tenantNetworkName,
    subnet: 'Isolated internal bridge (no internet egress)',
    tools: ['Nmap', 'Metasploit', 'Burp Suite', 'Wireshark', 'SQLmap', 'Hydra', 'John the Ripper'],
  };

  const host = h('div', { class: 'space-y-6' });

  const stepsList = [
    { num: 1, label: 'OS Image' },
    { num: 2, label: 'Compute' },
    { num: 3, label: 'Network' },
    { num: 4, label: 'Tools' },
    { num: 5, label: 'Confirm & Boot' },
  ];

  function selectedCatalogEntry() {
    return catalogImages.find((img) => img.id === form.imageId) || catalogImages[0] || DEFAULT_CATALOG[0];
  }

  function isNameValid(val) {
    return VM_NAME_REGEX.test(String(val || '').trim());
  }

  function stopElapsedTimer() {
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
    if (pollWatchTimer) {
      clearInterval(pollWatchTimer);
      pollWatchTimer = null;
    }
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    creationStartedMs = Date.now();
    elapsedSeconds = 0;
    elapsedTimer = setInterval(() => {
      elapsedSeconds = (Date.now() - creationStartedMs) / 1000;
      const timerEl = document.getElementById('boot-timer');
      if (timerEl) timerEl.textContent = `${elapsedSeconds.toFixed(1)}s`;
    }, 100);
  }

  function appendLog(stage, message) {
    if (!message) return;
    const last = creationLogs[creationLogs.length - 1];
    if (last && last.stage === stage && last.message === message) return;
    const ts = creationStartedMs ? `${((Date.now() - creationStartedMs) / 1000).toFixed(1)}s` : '0.0s';
    creationLogs.push({ stage, message, ts });
  }

  function formatErrorMessage(err) {
    const code = err?.code || '';
    if (code) {
      const key = `vm.create.err.${code}`;
      const translated = t(key);
      if (translated && translated !== key) {
        return translated;
      }
    }
    return err?.message || 'Failed to provision VM container.';
  }

  async function loadImageHealth() {
    catalogLoading = true;
    try {
      const health = await api.images.health();
      if (health && Array.isArray(health.images) && health.images.length) {
        catalogImages = health.images;
      }
      if (typeof health?.demoMode === 'boolean') demoMode = health.demoMode;
      if (typeof health?.dockerReachable === 'boolean') dockerReachable = health.dockerReachable;
    } catch {
      // Keep default catalog fallback when offline
    } finally {
      catalogLoading = false;
      render();
    }
  }

  async function handleAdminPullImage(imageId) {
    if (pullingImage || !isAdmin) return;
    pullingImage = true;
    render();
    try {
      await api.images.prepare(imageId);
      toast({ title: 'Image ready', description: `${imageId} is now available on the Docker host.`, kind: 'success' });
      await loadImageHealth();
    } catch (err) {
      toast({ title: 'Image pull failed', description: err.message || 'Could not pull image.', kind: 'error' });
    } finally {
      pullingImage = false;
      render();
    }
  }

  // Subscribe to real SSE creation progress events
  const unsubProgress = on('vm:creation_progress', (evt) => {
    if (!evt) return;
    const matchesCreated = createdVm && evt.vmId === createdVm.id;
    const matchesPendingName = launching && !createdVm && evt.vmName === form.name.trim();
    if (!matchesCreated && !matchesPendingName) return;

    creationStage = evt.stage;
    if (typeof evt.elapsedMs === 'number' && evt.elapsedMs >= 0) {
      elapsedSeconds = evt.elapsedMs / 1000;
    }
    if (evt.ip && createdVm) {
      createdVm = { ...createdVm, ip: evt.ip };
    }
    appendLog(evt.stage, evt.message);

    if (evt.stage === 'ready') {
      stopElapsedTimer();
      launching = false;
      cancelling = false;
      activeIdempotencyKey = null;
      if (createdVm) {
        createdVm = { ...createdVm, status: 'running', ip: evt.ip || createdVm.ip };
      }
      if (!readyToasted) {
        readyToasted = true;
        toast({
          title: `${evt.vmName} ready`,
          description: 'Isolated Kali Linux container is running and ready for Remote Desktop and Terminal.',
          kind: 'success',
        });
      }
    } else if (evt.stage === 'failed') {
      stopElapsedTimer();
      launching = false;
      cancelling = false;
      activeIdempotencyKey = null;
      creationError = { code: 'readiness_failed', message: evt.error || evt.message || 'Provisioning failed.' };
      createdVm = null;
      toast({ title: t('vm.create.stage.failed'), description: creationError.message, kind: 'error' });
    } else if (evt.stage === 'cancelled') {
      stopElapsedTimer();
      launching = false;
      cancelling = false;
      activeIdempotencyKey = null;
      createdVm = null;
      toast({ title: t('vm.create.stage.cancelled'), description: evt.message || 'Provisioning cancelled and cleaned up.', kind: 'info' });
    }
    render();
  });

  // Also sync with VM store snapshots in case SSE creation_progress arrives before POST response returns
  const unsubVms = subscribeVms((snap) => {
    if (!createdVm) return;
    const live = (snap.vms || []).find((v) => v.id === createdVm.id);
    if (!live) return;

    const changed = live.status !== createdVm.status || live.ip !== createdVm.ip;
    createdVm = { ...createdVm, ...live };

    if (live.status === 'running' && creationStage !== 'ready') {
      creationStage = 'ready';
      stopElapsedTimer();
      launching = false;
      cancelling = false;
      activeIdempotencyKey = null;
      appendLog('ready', `${live.name} is running at ${live.ip || 'internal lab IP'}.`);
      render();
    } else if (changed) {
      render();
    }
  });

  onCleanup(() => {
    stopElapsedTimer();
    unsubProgress();
    unsubVms();
  });

  function isInFlightProvisioning() {
    return (
      launching ||
      (creationStage !== null &&
        creationStage !== 'ready' &&
        creationStage !== 'failed' &&
        creationStage !== 'cancelled')
    );
  }

  function renderImageReadinessBanner() {
    if (demoMode || catalogLoading) return null;
    const selected = selectedCatalogEntry();

    if (!dockerReachable) {
      return h(
        'div',
        {
          role: 'alert',
          class: 'rounded-xl border p-4 text-xs flex flex-wrap items-center justify-between gap-3',
          style: 'background-color: var(--danger-bg); border-color: var(--danger-border); color: var(--danger-text);',
        },
        h('div', { class: 'space-y-0.5' },
          h('div', { class: 'font-semibold' }, t('vm.docker.unreachableTitle')),
          h('div', { class: 'opacity-90' }, t('vm.docker.unreachableDesc'))
        )
      );
    }

    if (selected && !selected.ready) {
      return h(
        'div',
        {
          role: 'alert',
          class: 'rounded-xl border p-4 text-xs flex flex-wrap items-center justify-between gap-3',
          style: 'background-color: var(--warning-bg); border-color: var(--warning-border); color: var(--warning-text);',
        },
        h('div', { class: 'space-y-0.5' },
          h('div', { class: 'font-semibold' }, t('vm.create.err.image_not_ready')),
          h('div', { class: 'opacity-90' }, t('vm.create.imageNotReady'))
        ),
        isAdmin
          ? button({
              label: pullingImage ? 'Pulling image...' : t('vm.create.pullImage'),
              icon: pullingImage ? 'loader' : 'download',
              variant: 'secondary',
              size: 'sm',
              disabled: pullingImage,
              onClick: () => handleAdminPullImage(selected.id),
            })
          : null
      );
    }

    return null;
  }

  function renderProgressStepper() {
    if (!creationStage && !creationLogs.length) return null;

    const currentIdx = creationStage in STAGE_ORDER ? STAGE_ORDER[creationStage] : -1;
    const isFailed = creationStage === 'failed';
    const isCancelled = creationStage === 'cancelled';
    const isReady = creationStage === 'ready';
    const canCancel = Boolean(createdVm?.id) && isInFlightProvisioning() && !cancelling;

    return h(
      'div',
      {
        id: 'boot-log-container',
        'aria-live': 'polite',
        class: 'rounded-xl border border-line bg-surface p-5 space-y-4',
      },
      h('div', { class: 'flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3' },
        h('div', { class: 'flex items-center gap-2' },
          h('span', { class: 'text-xs font-semibold text-fg' }, 'Provisioning Progress'),
          badge({
            label: t(`vm.create.stage.${creationStage || 'queued'}`),
            tone: isReady ? 'accent' : isFailed ? 'danger' : isCancelled ? 'neutral' : 'warn',
          })
        ),
        h('div', { class: 'flex items-center gap-3' },
          h('span', { id: 'boot-timer', class: 'font-mono text-xs font-semibold text-accent' }, `${elapsedSeconds.toFixed(1)}s`),
          canCancel
            ? button({
                attrs: { id: 'cancel-create-btn' },
                label: cancelling ? 'Cancelling...' : t('vm.create.cancel'),
                variant: 'danger',
                size: 'sm',
                disabled: cancelling,
                onClick: handleCancelCreation,
              })
            : null
        )
      ),
      h(
        'ol',
        { class: 'grid grid-cols-1 sm:grid-cols-5 gap-2 text-[11px]' },
        PROGRESS_STAGES.map((st, idx) => {
          const done = isReady || (currentIdx > idx);
          const active = !isFailed && !isCancelled && !isReady && currentIdx === idx;
          return h(
            'li',
            {
              'data-stage': st.id,
              'data-state': done ? 'done' : active ? 'active' : 'pending',
              class: cx(
                'rounded-lg border px-2.5 py-2 flex items-center gap-2 transition-colors',
                done
                  ? 'border-accent bg-accent/10 text-fg'
                  : active
                    ? 'border-accent bg-raised text-fg font-semibold'
                    : 'border-line bg-canvas text-muted'
              ),
            },
            h(
              'span',
              {
                class: cx(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]',
                  done ? 'bg-accent text-canvas font-bold' : active ? 'bg-accent/20 text-accent font-bold' : 'bg-raised text-muted'
                ),
              },
              done ? '✓' : String(idx + 1)
            ),
            h('span', { class: 'truncate' }, t(st.key))
          );
        })
      ),
      h(
        'div',
        {
          id: 'boot-logs',
          'data-surface': 'dark',
          style: 'background-color: var(--ink-950);',
          class: 'rounded-lg border border-line p-3 font-mono text-[11px] leading-relaxed text-fg max-h-40 overflow-y-auto space-y-1',
        },
        creationLogs.length
          ? creationLogs.map((entry) =>
              h(
                'div',
                {
                  class: cx(
                    'flex items-start gap-2',
                    entry.stage === 'ready' ? 'text-accent font-semibold' : entry.stage === 'failed' ? 'text-danger' : 'text-fg'
                  ),
                },
                h('span', { class: 'text-muted shrink-0' }, `[${entry.ts}]`),
                h('span', {}, entry.message)
              )
            )
          : h('div', { class: 'text-muted' }, 'Waiting for Docker Engine response...')
      )
    );
  }

  function renderErrorBanner() {
    if (!creationError) return null;
    const isLimitReached = creationError.code === 'vm_limit_reached';
    return h(
      'div',
      {
        id: 'create-error-banner',
        role: 'alert',
        class: 'rounded-xl border p-4 text-xs flex flex-wrap items-center justify-between gap-3',
        style: 'background-color: var(--danger-bg); border-color: var(--danger-border); color: var(--danger-text);',
      },
      h('div', { class: 'space-y-0.5' },
        h('div', { class: 'font-semibold' }, 'Provisioning Error'),
        h('div', {}, creationError.message)
      ),
      isLimitReached
        ? button({
            label: 'Request Extra VM',
            variant: 'secondary',
            size: 'sm',
            onClick: () =>
              openVmRequestModal({
                initialSpecs: form,
                onSuccess: () => navigate('/vms'),
              }),
          })
        : null
    );
  }

  function animateStepChange(el) {
    if (!el || isReducedMotion()) return;
    loadMotionMini()
      .then(({ animate }) => {
        animate(el, { opacity: [0.001, 1], y: [6, 0] }, { duration: 0.18, ease: EASINGS.expoOut });
      })
      .catch(() => {});
  }

  function render() {
    host.innerHTML = '';

    const header = pageHeader({
      title: 'Launch Virtual Machine',
      description: demoMode
        ? `${t('vm.demo.label')}: preview provisioning workflow without creating Docker containers.`
        : 'Provision a brand-new, isolated Kali Linux container with its own volume, internal lab network, and unique credentials.',
    });

    const indicator = h(
      'nav',
      {
        'aria-label': 'VM creation steps',
        class: 'flex items-center justify-between border-b border-line pb-4 text-xs select-none',
      },
      stepsList.map((s) => {
        const isCur = step === s.num;
        const isDone = step > s.num;
        const locked = isInFlightProvisioning();
        return h(
          'button',
          {
            type: 'button',
            disabled: locked || s.num > step,
            class: cx(
              'flex items-center gap-2 font-medium transition-colors',
              locked || s.num > step ? 'cursor-not-allowed' : 'cursor-pointer',
              isCur ? 'text-accent font-semibold' : isDone ? 'text-fg' : 'text-muted'
            ),
            onClick: () => {
              if (!locked && s.num < step) {
                step = s.num;
                render();
              }
            },
          },
          h(
            'span',
            {
              class: cx(
                'flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px]',
                isCur ? 'bg-accent text-canvas font-bold' : isDone ? 'bg-raised text-accent' : 'bg-raised text-muted'
              ),
            },
            isDone ? '✓' : String(s.num)
          ),
          h('span', { class: 'hidden sm:inline' }, s.label)
        );
      })
    );

    const stepBody = renderStepContent();
    const formContent = h('div', { class: 'space-y-6 flex-1 min-w-0' },
      renderImageReadinessBanner(),
      stepBody,
      renderNavButtons()
    );

    const summaryPanel = renderSummaryPanel();

    const layoutGrid = h(
      'div',
      {
        class: 'grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start',
      },
      formContent,
      summaryPanel
    );

    host.appendChild(header);
    host.appendChild(indicator);
    host.appendChild(layoutGrid);
    animateStepChange(stepBody);
  }

  function renderStepContent() {
    switch (step) {
      case 1: {
        const valid = isNameValid(form.name);
        const nameControl = input({
          id: 'vm-name-input',
          value: form.name,
          placeholder: 'kali-lab-02',
          mono: true,
          onInput: (val) => {
            form.name = val;
            const summaryName = document.getElementById('summary-vm-name');
            if (summaryName) summaryName.textContent = val || 'kali-lab-new';
            const errEl = document.getElementById('vm-name-validation');
            const ok = isNameValid(val);
            if (errEl) {
              errEl.classList.toggle('hidden', ok);
            }
            const nextBtn = document.getElementById('wizard-next-btn');
            if (nextBtn) nextBtn.disabled = !ok;
          },
        });

        return h('div', { class: 'space-y-4' },
          h('div', { class: 'flex items-center justify-between gap-2' },
            h('h3', { class: 'text-sm font-semibold text-fg' }, '1. Choose Operating System Image'),
            badge({ label: demoMode ? t('vm.demo.label') : 'Golden Catalog Image', tone: 'accent' })
          ),
          h(
            'div',
            { class: 'grid grid-cols-1 sm:grid-cols-3 gap-3' },
            catalogImages.map((img) => osOption(img))
          ),
          h('div', { class: 'pt-2 space-y-1.5' },
            field({
              id: 'vm-name-input',
              label: 'VM Instance Name',
              hint: t('vm.create.nameInvalid'),
              control: nameControl,
            }),
            h(
              'p',
              {
                id: 'vm-name-validation',
                role: 'alert',
                class: cx('text-[11px] font-medium', valid ? 'hidden' : ''),
                style: 'color: var(--danger-text);',
              },
              t('vm.create.nameInvalid')
            )
          )
        );
      }

      case 2:
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '2. Select Compute Specifications'),
          h('div', { class: 'grid grid-cols-1 sm:grid-cols-3 gap-3' },
            specOption(1, 2, 20, 'Small (CTF / Lightweight)'),
            specOption(2, 4, 30, 'Standard (Recommended)'),
            specOption(4, 8, 50, 'Heavy (Burp Suite / Wordlists)')
          )
        );

      case 3:
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '3. Tenant Network & Storage Isolation'),
          h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-3 text-xs' },
            h('div', { class: 'flex items-center justify-between gap-2' },
              h('span', { class: 'text-muted font-medium' }, 'Tenant Internal Network:'),
              h('span', { class: 'font-mono text-fg font-medium' }, form.vpc)
            ),
            h('div', { class: 'flex items-center justify-between gap-2' },
              h('span', { class: 'text-muted font-medium' }, 'Outbound Internet Access:'),
              badge({ label: 'Blocked (Internal Bridge)', tone: 'accent' })
            ),
            h('div', { class: 'flex items-center justify-between gap-2' },
              h('span', { class: 'text-muted font-medium' }, 'Persistent Volume:'),
              h('span', { class: 'font-mono text-fg font-medium' }, 'Dedicated per-VM volume (/home/student)')
            ),
            h('div', { class: 'flex items-center justify-between gap-2' },
              h('span', { class: 'text-muted font-medium' }, 'Host Ports Exposed:'),
              h('span', { class: 'font-mono text-fg font-medium' }, 'None (proxied via Guacamole & Gateway)')
            )
          )
        );

      case 4:
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '4. Baked-in Pentesting Tools'),
          h('p', { class: 'text-xs text-muted' }, 'These tools are pre-baked into the golden Kali image so new containers boot rapidly without downloading packages.'),
          h(
            'div',
            { class: 'flex flex-wrap gap-2' },
            ['Nmap', 'Metasploit', 'Burp Suite', 'Wireshark', 'SQLmap', 'Hydra', 'John the Ripper', 'Dirb', 'Gobuster', 'Aircrack-ng'].map((tool) => {
              const checked = form.tools.includes(tool);
              return h(
                'button',
                {
                  type: 'button',
                  class: cx(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                    checked ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-muted hover:text-fg'
                  ),
                  onClick: () => {
                    if (checked) form.tools = form.tools.filter((item) => item !== tool);
                    else form.tools.push(tool);
                    render();
                  },
                },
                `${checked ? '✓ ' : '+ '}${tool}`
              );
            })
          )
        );

      default: {
        const selected = selectedCatalogEntry();
        const isVmReady = createdVm && (createdVm.status === 'running' || creationStage === 'ready');
        return h('div', { class: 'space-y-4' },
          h('h3', { class: 'text-sm font-semibold text-fg' }, '5. Review & Launch Kali Linux VM'),
          h('div', { class: 'rounded-xl border border-line bg-surface p-5 space-y-3 text-xs' },
            h('div', { class: 'flex justify-between gap-2' },
              h('span', { class: 'text-muted' }, 'Instance Name:'),
              h('span', { class: 'font-medium font-mono text-fg' }, form.name)
            ),
            h('div', { class: 'flex justify-between gap-2' },
              h('span', { class: 'text-muted' }, 'Catalog Image:'),
              h('span', { class: 'font-medium text-fg' }, `${selected.label} (${selected.id})`)
            ),
            h('div', { class: 'flex justify-between gap-2' },
              h('span', { class: 'text-muted' }, 'Hardware Limits:'),
              h('span', { class: 'font-mono text-fg' }, `${form.vcpu} vCPU / ${form.ram} GB RAM / ${form.disk} GB Volume`)
            ),
            h('div', { class: 'flex justify-between gap-2' },
              h('span', { class: 'text-muted' }, 'Tenant Network:'),
              h('span', { class: 'font-mono text-fg' }, form.vpc)
            ),
            h('div', { class: 'flex justify-between gap-2' },
              h('span', { class: 'text-muted' }, 'Credentials:'),
              h('span', { class: 'text-fg' }, 'Unique per-VM secret (auto-injected by gateway)')
            ),
            createdVm?.ip
              ? h('div', { class: 'flex justify-between gap-2 border-t border-line pt-2' },
                  h('span', { class: 'text-muted' }, 'Assigned Lab IP:'),
                  h('span', { id: 'created-vm-ip', class: 'font-mono font-semibold text-accent' }, createdVm.ip)
                )
              : null
          ),
          renderErrorBanner(),
          renderProgressStepper(),
          isVmReady
            ? h('div', { id: 'vm-ready-banner', class: 'flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-accent/10 p-4' },
                h('div', { class: 'text-xs font-medium text-fg mr-auto space-y-0.5' },
                  h('div', { class: 'font-semibold' }, `${createdVm.name} is running and ready.`),
                  createdVm.ip
                    ? h('div', { class: 'font-mono text-[11px] text-muted' }, `Lab IP: ${createdVm.ip}`)
                    : null
                ),
                button({
                  attrs: { id: 'open-desktop-btn' },
                  label: 'Open Remote Desktop',
                  icon: 'monitor',
                  variant: 'primary',
                  size: 'sm',
                  onClick: () => navigate(`/desktop?vm=${encodeURIComponent(createdVm.id)}`),
                }),
                button({
                  attrs: { id: 'open-terminal-btn' },
                  label: 'Open Terminal',
                  icon: 'terminal',
                  variant: 'secondary',
                  size: 'sm',
                  onClick: () => navigate(`/terminal?vm=${encodeURIComponent(createdVm.id)}`),
                }),
                button({
                  label: 'View All VMs',
                  variant: 'ghost',
                  size: 'sm',
                  onClick: () => navigate('/vms'),
                })
              )
            : null
        );
      }
    }
  }

  function osOption(img) {
    const isCur = form.imageId === img.id;
    const available = Boolean(img.available);
    const tone = !available ? 'neutral' : demoMode || img.ready ? 'accent' : 'warn';
    const badgeLabel = !available ? 'Coming Soon' : demoMode ? 'Simulated' : img.ready ? 'Ready' : 'Not Ready';

    return h(
      'button',
      {
        type: 'button',
        disabled: !available,
        class: cx(
          'rounded-xl border p-4 text-left transition-colors',
          !available
            ? 'border-line bg-surface opacity-50 cursor-not-allowed'
            : isCur
              ? 'border-accent bg-accent/5 cursor-pointer'
              : 'border-line bg-surface hover:bg-raised cursor-pointer'
        ),
        onClick: () => {
          if (!available) return;
          form.imageId = img.id;
          form.os = img.os || 'kali';
          render();
        },
      },
      h('div', { class: 'flex items-center justify-between gap-2' },
        h('div', { class: 'font-semibold text-xs text-fg' }, img.label),
        badge({ label: badgeLabel, tone })
      ),
      h('div', { class: 'text-[11px] text-muted mt-1.5 leading-relaxed' }, img.description)
    );
  }

  function specOption(vcpu, ram, disk, label) {
    const isCur = form.vcpu === vcpu && form.ram === ram && form.disk === disk;
    return h(
      'button',
      {
        type: 'button',
        class: cx(
          'rounded-xl border p-4 text-left transition-colors cursor-pointer',
          isCur ? 'border-accent bg-accent/5' : 'border-line bg-surface hover:bg-raised'
        ),
        onClick: () => {
          form.vcpu = vcpu;
          form.ram = ram;
          form.disk = disk;
          render();
        },
      },
      h('div', { class: 'font-semibold text-xs text-fg' }, label),
      h('div', { class: 'font-mono text-xs text-accent mt-1' }, `${vcpu} Core · ${ram} GB RAM`),
      h('div', { class: 'text-[11px] text-muted mt-0.5' }, `${disk} GB Isolated Volume`)
    );
  }

  function renderSummaryPanel() {
    const selected = selectedCatalogEntry();
    return h(
      'aside',
      {
        class: 'rounded-xl border border-line bg-surface p-5 space-y-4 text-xs sticky top-20 select-none',
      },
      h('h4', { class: 'font-semibold text-fg text-sm border-b border-line pb-2' }, 'Specification Summary'),
      h('div', { class: 'space-y-2.5' },
        h('div', { class: 'flex justify-between gap-2' },
          h('span', { class: 'text-muted' }, 'Instance:'),
          h('span', { id: 'summary-vm-name', class: 'font-mono font-medium text-fg truncate max-w-[150px]' }, form.name)
        ),
        h('div', { class: 'flex justify-between gap-2' },
          h('span', { class: 'text-muted' }, 'Catalog Image:'),
          h('span', { class: 'font-medium text-fg' }, selected.label)
        ),
        h('div', { class: 'flex justify-between gap-2' },
          h('span', { class: 'text-muted' }, 'vCPU Limit:'),
          h('span', { class: 'font-mono text-fg' }, `${form.vcpu} vCPU`)
        ),
        h('div', { class: 'flex justify-between gap-2' },
          h('span', { class: 'text-muted' }, 'Memory Limit:'),
          h('span', { class: 'font-mono text-fg' }, `${form.ram} GB RAM`)
        ),
        h('div', { class: 'flex justify-between gap-2' },
          h('span', { class: 'text-muted' }, 'Storage Volume:'),
          h('span', { class: 'font-mono text-fg' }, `${form.disk} GB`)
        ),
        h('div', { class: 'flex justify-between gap-2' },
          h('span', { class: 'text-muted' }, 'Access:'),
          h('span', { class: 'font-mono text-accent' }, 'Tokenized RDP + SSH')
        )
      ),
      h('div', { class: 'border-t border-line pt-3 text-[11px] text-muted leading-relaxed' },
        demoMode
          ? 'Demo simulation is active. No real Docker containers are created.'
          : 'Each VM launches a fresh container with an isolated persistent volume and unique runtime credentials.'
      )
    );
  }

  function renderNavButtons() {
    const selected = selectedCatalogEntry();
    const imageBlocked = !demoMode && (!dockerReachable || (selected && !selected.ready && !catalogLoading));
    const isStep1Invalid = step === 1 && !isNameValid(form.name);
    const inFlight = isInFlightProvisioning();
    const done = Boolean(createdVm && (createdVm.status === 'running' || creationStage === 'ready'));

    return h(
      'div',
      { class: 'flex items-center justify-between pt-4 border-t border-line' },
      step > 1
        ? button({
            label: 'Back',
            variant: 'secondary',
            size: 'sm',
            disabled: inFlight,
            onClick: () => {
              step--;
              render();
            },
          })
        : h('div', {}),
      step < 5
        ? button({
            attrs: { id: 'wizard-next-btn' },
            label: 'Continue',
            variant: 'primary',
            size: 'sm',
            disabled: isStep1Invalid,
            onClick: () => {
              if (step === 1 && !isNameValid(form.name)) return;
              step++;
              render();
            },
          })
        : button({
            attrs: { id: 'launch-btn' },
            label: done ? 'VM Launched' : inFlight ? 'Provisioning...' : 'Launch Kali VM',
            variant: 'primary',
            size: 'sm',
            icon: inFlight ? 'loader' : 'play',
            disabled: done || inFlight || imageBlocked,
            onClick: startBootProvisioning,
          })
    );
  }

  async function handleCancelCreation() {
    if (!createdVm?.id || cancelling) return;
    cancelling = true;
    render();
    try {
      await api.vms.cancelCreation(createdVm.id);
      creationStage = 'cancelled';
      appendLog('cancelled', 'Creation cancelled. Container, volume, and quota slot released.');
      stopElapsedTimer();
      launching = false;
      createdVm = null;
      activeIdempotencyKey = null;
      toast({ title: t('vm.create.stage.cancelled'), description: 'Container and volume removed cleanly.', kind: 'info' });
    } catch (err) {
      toast({ title: 'Cancel failed', description: err.message || 'Could not cancel creation.', kind: 'error' });
    } finally {
      cancelling = false;
      render();
    }
  }

  async function startBootProvisioning() {
    if (isInFlightProvisioning() || (createdVm && createdVm.status === 'running')) return;

    const cleanName = String(form.name || '').trim();
    if (!isNameValid(cleanName)) {
      creationError = { code: 'invalid_name', message: t('vm.create.nameInvalid') };
      toast({ title: 'Validation error', description: t('vm.create.nameInvalid'), kind: 'error' });
      render();
      return;
    }

    if (!activeIdempotencyKey) {
      activeIdempotencyKey = makeIdempotencyKey();
    }

    launching = true;
    readyToasted = false;
    creationError = null;
    creationLogs = [];
    creationStage = 'queued';
    startElapsedTimer();
    appendLog('queued', `Requesting isolated container "${cleanName}" (${form.imageId}, ${form.vcpu} vCPU / ${form.ram} GB RAM)...`);
    render();

    try {
      const vm = await api.vms.create({
        name: cleanName,
        imageId: form.imageId,
        os: form.os,
        vcpu: form.vcpu,
        ram: form.ram,
        disk: form.disk,
        vpc: form.vpc,
        idempotencyKey: activeIdempotencyKey,
      });

      const liveFromStore = (getVmState().vms || []).find((v) => v.id === vm.id);
      createdVm = liveFromStore ? { ...vm, ...liveFromStore } : vm;

      if (createdVm.status === 'running' || creationStage === 'ready' || demoMode) {
        creationStage = 'ready';
        stopElapsedTimer();
        launching = false;
        activeIdempotencyKey = null;
        appendLog('ready', `${createdVm.name} is running at ${createdVm.ip || 'assigned lab IP'}.`);
        if (!readyToasted) {
          readyToasted = true;
          toast({
            title: `${createdVm.name} ready`,
            description: 'Isolated Kali Linux container is running and ready for Remote Desktop and Terminal.',
            kind: 'success',
          });
        }
      } else {
        if (creationStage === 'queued') {
          creationStage = 'starting';
        }
        appendLog('starting', `Container created (${createdVm.ip || 'assigning lab IP'}). Waiting for desktop and SSH readiness...`);
        // Safety-net sync in case SSE ready event raced with the POST response
        if (!pollWatchTimer) {
          pollWatchTimer = setInterval(() => {
            if (!createdVm || creationStage === 'ready' || creationStage === 'failed' || creationStage === 'cancelled') {
              if (pollWatchTimer) {
                clearInterval(pollWatchTimer);
                pollWatchTimer = null;
              }
              return;
            }
            void refreshVms({ force: true, silent: true });
          }, 1500);
        }
      }
      render();
    } catch (err) {
      stopElapsedTimer();
      launching = false;
      activeIdempotencyKey = null;
      const formatted = formatErrorMessage(err);
      creationStage = 'failed';
      creationError = { code: err?.code || 'create_failed', message: formatted };
      appendLog('failed', formatted);
      render();

      if (err?.code === 'vm_limit_reached') {
        toast({ title: 'VM limit reached', description: formatted, kind: 'error' });
        openVmRequestModal({
          initialSpecs: form,
          onSuccess: () => navigate('/vms'),
        });
        return;
      }
      toast({ title: 'Failed to create VM', description: formatted, kind: 'error' });
    }
  }

  render();
  void loadImageHealth();
  return PageContainer({ variant: 'default' }, host);
}

import { h, icon, cx } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { on } from '../../lib/events.js';
import { onCleanup } from '../../lib/router.js';
import { useAuth } from '../../lib/auth.js';
import { OS } from '../../mock/vms.js';
import { button } from '../../components/ui/button.js';
import { searchInput, select } from '../../components/ui/input.js';
import { table } from '../../components/ui/table.js';
import { skeletonRows } from '../../components/ui/skeleton.js';
import { emptyState, errorState } from '../../components/ui/empty-state.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { toast } from '../../components/ui/toast.js';

export function ApprovalsPage() {
  const auth = useAuth();
  let allRequests = [];
  let state = 'loading'; // loading | ready | error
  let query = '';
  let statusFilter = 'pending';
  let activeDrawerRequest = null;

  const host = h('div', { 'aria-live': 'polite' });
  const container = h('div', { class: 'space-y-4' });

  function getSlaBadge(requestedAt) {
    const ageHours = (Date.now() - new Date(requestedAt).getTime()) / 3600000;
    if (ageHours < 12) {
      return h('span', { class: 'inline-flex items-center gap-1 rounded-full bg-[var(--success-bg)] border border-[var(--success-border)] px-2 py-0.5 text-[10px] font-mono text-[var(--success-text)]' },
        h('span', { class: 'w-1.5 h-1.5 rounded-full bg-[var(--success)]' }),
        `< 12h (${ageHours.toFixed(1)}h)`
      );
    } else if (ageHours < 24) {
      return h('span', { class: 'inline-flex items-center gap-1 rounded-full bg-[var(--warning-bg)] border border-[var(--warning-border)] px-2 py-0.5 text-[10px] font-mono text-[var(--warning-text)]' },
        h('span', { class: 'w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse' }),
        `12-24h (${ageHours.toFixed(1)}h)`
      );
    } else {
      return h('span', { class: 'inline-flex items-center gap-1 rounded-full bg-[var(--danger-bg)] border border-[var(--danger-border)] px-2 py-0.5 text-[10px] font-mono text-[var(--danger-text)] font-semibold' },
        h('span', { class: 'w-1.5 h-1.5 rounded-full bg-[var(--danger)] animate-ping' }),
        `> 24h SLA Breached`
      );
    }
  }

  function columns() {
    return [
      {
        key: 'student',
        label: 'MAHASISWA & KELAS',
        render: (r) => h('div', { class: 'space-y-0.5' },
          h('div', { class: 'font-semibold text-fg text-xs' }, r.studentName),
          h('div', { class: 'text-[11px] text-muted font-mono' }, `${r.studentEmail} · ${r.cohort}`)
        )
      },
      {
        key: 'vm',
        label: 'VM & SPESIFIKASI',
        render: (r) => h('div', { class: 'space-y-0.5' },
          h('div', { class: 'font-mono text-xs text-accent font-medium' }, r.requestedSpecs.name),
          h('div', { class: 'text-[11px] text-muted' }, `${OS[r.requestedSpecs.os]?.label || r.requestedSpecs.os} (${r.requestedSpecs.vcpu} vCPU / ${r.requestedSpecs.ram}GB)`)
        )
      },
      {
        key: 'purpose',
        label: 'ALASAN KEBUTUHAN',
        render: (r) => h('div', { class: 'max-w-xs text-xs text-muted leading-relaxed line-clamp-2' }, r.purpose)
      },
      {
        key: 'sla',
        label: 'SLA AGE',
        class: 'hidden md:table-cell',
        render: (r) => getSlaBadge(r.requestedAt)
      },
      {
        key: 'status',
        label: 'STATUS',
        render: (r) => {
          let badgeClass = 'bg-[var(--warning-bg)] text-[var(--warning-text)] border-[var(--warning-border)]';
          let label = 'Pending';
          if (r.status === 'approved' || r.status === 'fulfilled') {
            badgeClass = 'bg-[var(--success-bg)] text-[var(--success-text)] border-[var(--success-border)]';
            label = r.status === 'fulfilled' ? 'Auto-Provisioned' : 'Approved';
          } else if (r.status === 'rejected') {
            badgeClass = 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]';
            label = 'Rejected';
          } else if (r.status === 'cancelled') {
            badgeClass = 'bg-raised text-muted border-line';
            label = 'Cancelled';
          }

          return h('span', { class: cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium', badgeClass) },
            h('span', { class: 'w-1.5 h-1.5 rounded-full bg-current' }),
            label
          );
        }
      },
      {
        key: 'actions',
        label: 'TINDAKAN',
        class: 'w-48 text-right',
        render: (r) => {
          if (r.status !== 'pending') {
            return button({
              label: 'Detail',
              size: 'xs',
              variant: 'secondary',
              onClick: () => openReviewDrawer(r)
            });
          }

          return h('div', { class: 'flex items-center justify-end gap-1.5' },
            button({
              label: 'Tinjau',
              size: 'xs',
              variant: 'outline',
              onClick: () => openReviewDrawer(r)
            }),
            button({
              icon: 'check',
              size: 'xs',
              variant: 'primary',
              title: 'Setujui Langsung',
              onClick: async () => {
                try {
                  await api.vmRequests.approve(r.id, { reviewNote: 'Approved for course project' });
                  toast.success(`Permohonan ${r.studentName} disetujui!`);
                  load();
                } catch (err) {
                  toast.error(err.message);
                }
              }
            }),
            button({
              icon: 'x',
              size: 'xs',
              variant: 'ghost',
              title: 'Tolak',
              onClick: () => openRejectPrompt(r)
            })
          );
        }
      }
    ];
  }

  function openRejectPrompt(req) {
    const note = prompt(`Masukkan alasan penolakan untuk ${req.studentName} (minimal 5 karakter):`, 'Mohon selesaikan modul sebelumnya terlebih dahulu.');
    if (!note || note.trim().length < 5) {
      toast.error('Catatan penolakan minimal 5 karakter');
      return;
    }
    api.vmRequests.reject(req.id, note.trim())
      .then(() => {
        toast.info(`Permohonan ${req.studentName} ditolak.`);
        load();
      })
      .catch((err) => toast.error(err.message));
  }

  function openReviewDrawer(req) {
    activeDrawerRequest = req;
    renderDrawer();
  }

  function renderDrawer() {
    const existing = document.getElementById('review-drawer');
    if (existing) existing.remove();
    if (!activeDrawerRequest) return;

    const r = activeDrawerRequest;
    const isPending = r.status === 'pending';

    let customVcpu = r.requestedSpecs.vcpu;
    let customRam = r.requestedSpecs.ram;
    let rejectReason = '';

    const overlay = h('div', {
      id: 'review-drawer',
      class: 'fixed inset-0 z-50 flex justify-end bg-[var(--scrim)] backdrop-blur-sm animate-in fade-in duration-200'
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        activeDrawerRequest = null;
        overlay.remove();
      }
    });

    const drawer = h('div', {
      class: 'w-full max-w-md h-full bg-surface border-l border-line p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200 space-y-6 text-fg select-none'
    });

    // Drawer Header
    const dHeader = h('div', { class: 'border-b border-line pb-4 flex items-start justify-between' },
      h('div', { class: 'space-y-1' },
        h('h3', { class: 'text-base font-semibold text-fg flex items-center gap-2' },
          icon('clipboard-check', 'w-5 h-5 text-accent'),
          'Tinjauan Permohonan VM'
        ),
        h('p', { class: 'text-xs text-muted' }, `ID: ${r.id}`)
      ),
      h('button', {
        type: 'button',
        class: 'text-muted hover:text-fg p-1 rounded-lg hover:bg-raised transition-colors',
        onClick: () => { activeDrawerRequest = null; overlay.remove(); }
      }, icon('x', 'w-4 h-4'))
    );

    // Student Info & Quota Impact Card
    const dBody = h('div', { class: 'space-y-5 text-xs flex-1' },
      // Student details
      h('div', { class: 'rounded-xl border border-line bg-raised/40 p-4 space-y-2.5' },
        h('div', { class: 'flex items-center gap-2.5' },
          h('div', { class: 'w-8 h-8 rounded-full bg-accent/20 text-accent font-mono font-bold flex items-center justify-center text-xs' },
            r.studentName.slice(0, 2).toUpperCase()
          ),
          h('div', { class: 'min-w-0 flex-1' },
            h('p', { class: 'font-semibold text-fg text-xs truncate' }, r.studentName),
            h('p', { class: 'text-muted text-[11px] font-mono truncate' }, `${r.studentEmail} · ${r.cohort}`)
          )
        ),
        h('div', { class: 'grid grid-cols-2 gap-2 pt-2 border-t border-line text-[11px]' },
          h('div', {}, h('span', { class: 'text-muted block' }, 'Status Kuota:'), h('span', { class: 'font-mono text-[var(--warning-text)] font-semibold' }, '3 / 3 VM (Penuh)')),
          h('div', {}, h('span', { class: 'text-muted block' }, 'Permintaan Ke-:'), h('span', { class: 'font-mono text-fg font-medium' }, 'Slot ke-4'))
        )
      ),

      // Requested VM Details
      h('div', { class: 'rounded-xl border border-line bg-canvas p-4 space-y-2' },
        h('h4', { class: 'font-semibold text-fg text-xs uppercase tracking-wider text-muted' }, 'Spesifikasi Diajukan'),
        h('div', { class: 'space-y-1.5' },
          h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Nama VM:'), h('span', { class: 'font-mono text-fg font-medium' }, r.requestedSpecs.name)),
          h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'OS:'), h('span', { class: 'uppercase font-medium text-fg' }, r.requestedSpecs.os)),
          h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Komputasi:'), h('span', { class: 'font-mono text-fg' }, `${r.requestedSpecs.vcpu} vCPU / ${r.requestedSpecs.ram} GB RAM / ${r.requestedSpecs.disk} GB NVMe`)),
          h('div', { class: 'flex justify-between' }, h('span', { class: 'text-muted' }, 'Durasi:'), h('span', { class: 'font-mono text-fg' }, `${r.durationDays} Hari`))
        )
      ),

      // Purpose & Justification
      h('div', { class: 'space-y-1.5' },
        h('h4', { class: 'font-semibold text-fg text-xs' }, 'Alasan & Justifikasi Mahasiswa:'),
        h('div', { class: 'rounded-xl border border-line bg-raised/20 p-3.5 text-xs text-muted leading-relaxed italic' },
          `"${r.purpose}"`
        )
      ),

      // Impact Analysis
      h('div', { class: 'rounded-xl border border-line bg-surface p-3.5 space-y-2' },
        h('h4', { class: 'font-semibold text-fg text-[11px] flex items-center gap-1.5 text-muted uppercase tracking-wider' },
          icon('cpu', 'w-3.5 h-3.5 text-accent'),
          'Analisis Kapasitas Host Pool'
        ),
        h('p', { class: 'text-[11px] text-muted leading-relaxed' },
          `Kapasitas Host Pool ${r.cohort} saat ini memiliki 42 GB RAM bebas dan 28 vCPU tersedia. Alokasi ini aman dari resiko over-commit.`
        )
      ),

      // Review options if pending
      isPending && h('div', { class: 'space-y-3 pt-2' },
        h('h4', { class: 'font-semibold text-fg text-xs' }, 'Penyesuaian Spesifikasi (Opsional):'),
        h('div', { class: 'grid grid-cols-2 gap-2' },
          h('div', { class: 'space-y-1' },
            h('label', { class: 'text-[10px] text-muted' }, 'vCPU Alokasi'),
            h('select', {
              class: 'w-full rounded-lg border border-line bg-canvas p-2 text-xs text-fg',
              onChange: (e) => { customVcpu = Number(e.target.value); }
            },
              h('option', { value: '1' }, '1 vCPU'),
              h('option', { value: '2', selected: true }, '2 vCPU (Sesuai)'),
              h('option', { value: '4' }, '4 vCPU')
            )
          ),
          h('div', { class: 'space-y-1' },
            h('label', { class: 'text-[10px] text-muted' }, 'RAM Alokasi'),
            h('select', {
              class: 'w-full rounded-lg border border-line bg-canvas p-2 text-xs text-fg',
              onChange: (e) => { customRam = Number(e.target.value); }
            },
              h('option', { value: '2' }, '2 GB RAM'),
              h('option', { value: '4', selected: true }, '4 GB (Sesuai)'),
              h('option', { value: '8' }, '8 GB')
            )
          )
        )
      )
    );

    // Actions
    const dFooter = isPending
      ? h('div', { class: 'border-t border-line pt-4 flex items-center gap-2' },
          button({
            label: 'Tolak Permohonan',
            variant: 'ghost',
            size: 'sm',
            onClick: () => {
              activeDrawerRequest = null;
              overlay.remove();
              openRejectPrompt(r);
            }
          }),
          button({
            label: 'Setujui & Buat VM',
            icon: 'check',
            variant: 'primary',
            size: 'sm',
            class: 'flex-1',
            onClick: async () => {
              try {
                await api.vmRequests.approve(r.id, {
                  approvedSpecs: {
                    name: r.requestedSpecs.name,
                    os: r.requestedSpecs.os,
                    vcpu: customVcpu,
                    ram: customRam,
                    disk: r.requestedSpecs.disk
                  },
                  reviewNote: 'Disetujui untuk kegiatan praktikum'
                });
                toast.success(`VM ${r.requestedSpecs.name} berhasil disetujui & otomatis di-provision!`);
                activeDrawerRequest = null;
                overlay.remove();
                load();
              } catch (err) {
                toast.error(err.message);
              }
            }
          })
        )
      : h('div', { class: 'border-t border-line pt-4' },
          button({
            label: 'Tutup',
            variant: 'secondary',
            size: 'sm',
            class: 'w-full',
            onClick: () => { activeDrawerRequest = null; overlay.remove(); }
          })
        );

    drawer.appendChild(dHeader);
    drawer.appendChild(dBody);
    drawer.appendChild(dFooter);
    overlay.appendChild(drawer);
    document.body.appendChild(overlay);
  }

  function draw() {
    if (state === 'loading') return host.replaceChildren(skeletonRows(4));
    if (state === 'error') return host.replaceChildren(errorState({ title: 'Gagal memuat persetujuan', onRetry: load }));

    let rows = allRequests;
    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (query) {
      rows = rows.filter((r) =>
        r.studentName.toLowerCase().includes(query) ||
        r.requestedSpecs.name.toLowerCase().includes(query) ||
        r.cohort.toLowerCase().includes(query)
      );
    }

    if (!rows.length) {
      return host.replaceChildren(emptyState({
        icon: 'clipboard-check',
        title: 'Tidak Ada Permohonan',
        description: statusFilter === 'pending' ? 'Semua permohonan VM tambahan telah ditinjau!' : 'Tidak ditemukan data permohonan yang sesuai filter.'
      }));
    }

    host.replaceChildren(table({ columns: columns(), rows, caption: 'Daftar Persetujuan Alokasi VM' }));
  }

  async function load({ silent = false } = {}) {
    if (!silent) { state = 'loading'; draw(); }
    try {
      allRequests = await api.vmRequests.list();
      state = 'ready';
    } catch {
      if (silent) return;
      state = 'error';
    }
    renderHeader();
    draw();
  }

  function renderHeader() {
    container.innerHTML = '';

    const pendingCount = allRequests.filter(r => r.status === 'pending').length;

    const header = pageHeader({
      title: 'Persetujuan Alokasi VM',
      description: 'Kelola dan setujui permohonan alokasi VM tambahan dari mahasiswa yang melampaui kuota mandiri 3 VM.',
      actions: h('div', { class: 'flex items-center gap-2' },
        h('span', { class: 'rounded-full bg-[var(--warning-bg)] border border-[var(--warning-border)] px-3 py-1 font-mono text-xs text-[var(--warning-text)] font-semibold flex items-center gap-1.5' },
          h('span', { class: 'w-2 h-2 rounded-full bg-[var(--warning)]' }),
          `${pendingCount} Menunggu Persetujuan`
        )
      )
    });

    const searchInputEl = searchInput({
      placeholder: 'Cari nama mahasiswa atau VM…',
      ariaLabel: 'Cari permohonan',
      onInput: (v) => { query = v.trim().toLowerCase(); draw(); }
    });

    const statusSelectEl = select({
      ariaLabel: 'Filter status',
      value: statusFilter,
      onChange: (v) => { statusFilter = v; draw(); },
      options: [
        { value: 'pending', label: 'Menunggu Persetujuan (Pending)' },
        { value: 'all', label: 'Semua Status' },
        { value: 'approved', label: 'Disetujui' },
        { value: 'rejected', label: 'Ditolak' }
      ]
    });

    const filterRow = h('div', { class: 'mb-4 flex flex-wrap items-center gap-2' }, searchInputEl, statusSelectEl);

    container.appendChild(header);
    container.appendChild(filterRow);
    container.appendChild(host);
  }

  onCleanup(on('requests:changed', () => load({ silent: true })));
  load();

  return PageContainer({ variant: 'default' }, container);
}

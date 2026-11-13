import { h, icon } from '../../lib/dom.js';
import { button } from '../../components/ui/button.js';
import { badge } from '../../components/ui/badge.js';
import { table } from '../../components/ui/table.js';
import { toast } from '../../components/ui/toast.js';
import { confirmDialog, openDialog } from '../../components/ui/dialog.js';
import { input, field, select } from '../../components/ui/input.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';

export function StoragePage() {
  let snapshots = [
    {
      id: 'snap-1',
      name: 'kali-lab-01-clean-baseline',
      vm: 'kali-lab-01',
      size: '12.4 GB',
      created: '2026-11-10 14:20',
      desc: 'Pristine state right after OS provisioning before lab exercises'
    },
    {
      id: 'snap-2',
      name: 'kali-lab-01-pre-sqli-exercise',
      vm: 'kali-lab-01',
      size: '13.1 GB',
      created: '2026-11-11 09:15',
      desc: 'Configured custom wordlists in /usr/share/wordlists and Burp proxy'
    },
    {
      id: 'snap-3',
      name: 'parrot-sec-base-snapshot',
      vm: 'parrot-sec-01',
      size: '10.8 GB',
      created: '2026-11-11 16:45',
      desc: 'Clean baseline for Parrot Security 6.1'
    }
  ];

  const host = h('div', { class: 'space-y-6' });

  function render() {
    host.innerHTML = '';

    const header = pageHeader({
      title: 'Snapshots & Storage Volumes',
      description: 'Instant copy-on-write (CoW) disk snapshots with rapid elasticity and 1-click rollback.',
      action: button({
        variant: 'primary',
        size: 'sm',
        icon: 'camera',
        label: 'Take Snapshot',
        onClick: openTakeSnapshotDialog
      })
    });

    // Volume usage KPI strip
    const metrics = h('div', { class: 'grid grid-cols-1 md:grid-cols-3 gap-4 text-xs' },
      h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-2' },
        h('span', { class: 'text-muted font-medium' }, 'Allocated NVMe Storage'),
        h('div', { class: 'flex items-baseline gap-2' },
          h('span', { class: 'text-2xl font-semibold tracking-tight text-fg' }, '75 GB'),
          h('span', { class: 'text-subtle' }, '/ 150 GB quota (50%)')
        ),
        h('div', { class: 'h-1.5 w-full rounded-full bg-line overflow-hidden' },
          h('div', { class: 'h-full bg-[var(--success)] rounded-full', style: 'width: 50%' })
        )
      ),
      h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-2' },
        h('span', { class: 'text-muted font-medium' }, 'Active Disk Snapshots'),
        h('div', { class: 'flex items-baseline gap-2' },
          h('span', { class: 'text-2xl font-semibold tracking-tight text-fg' }, snapshots.length),
          h('span', { class: 'text-subtle' }, 'instant rollback points')
        ),
        h('div', { class: 'text-[11px] text-muted' }, 'Copy-on-write differential storage enabled')
      ),
      h('div', { class: 'rounded-xl border border-line bg-surface p-4 space-y-2' },
        h('span', { class: 'text-muted font-medium' }, 'Cohort Shared Volume (NFS)'),
        h('div', { class: 'flex items-baseline gap-2' },
          h('span', { class: 'text-2xl font-semibold tracking-tight text-fg' }, '250 GB'),
          h('span', { class: 'text-[var(--success-text)] font-mono text-xs' }, 'MOUNTED')
        ),
        h('div', { class: 'text-[11px] font-mono text-subtle' }, 'Path: /mnt/shared-lab-tools')
      )
    );

    // Snapshots table
    const tableSection = h('div', { class: 'space-y-3' },
      h('div', { class: 'flex items-center justify-between' },
        h('h3', { class: 'text-sm font-semibold tracking-tight text-fg' }, 'Point-in-Time VM Snapshots'),
        h('span', { class: 'text-xs text-muted' }, `${snapshots.length} snapshots`)
      ),
      table({
        columns: [
          { key: 'name', label: 'Snapshot Name' },
          { key: 'vm', label: 'Virtual Machine', width: '140px' },
          { key: 'size', label: 'Differential Size', width: '130px' },
          { key: 'created', label: 'Created At', width: '160px' },
          { key: 'actions', label: 'Actions', width: '180px' }
        ],
        rows: snapshots.map(s => ({
          name: h('div', {},
            h('span', { class: 'text-xs font-mono font-medium text-fg block' }, s.name),
            h('span', { class: 'text-[11px] text-muted' }, s.desc)
          ),
          vm: badge({ label: s.vm, variant: 'outline', size: 'xs' }),
          size: h('span', { class: 'text-xs font-mono text-muted' }, s.size),
          created: h('span', { class: 'text-xs font-mono text-subtle' }, s.created),
          actions: h('div', { class: 'flex items-center gap-2' },
            button({
              variant: 'outline',
              size: 'xs',
              icon: 'rotate-ccw',
              label: 'Rollback',
              onClick: () => handleRollback(s)
            }),
            button({
              variant: 'ghost',
              size: 'xs',
              icon: 'trash-2',
              label: '',
              onClick: () => handleDelete(s)
            })
          )
        }))
      })
    );

    host.appendChild(header);
    host.appendChild(metrics);
    host.appendChild(tableSection);
  }

  function handleRollback(snap) {
    confirmDialog({
      title: `Roll back to ${snap.name}?`,
      description: `Target VM ${snap.vm} will be restored to its exact snapshot state. Current unsaved lab memory will be replaced.`,
      confirmLabel: 'Rollback Now',
      danger: true,
      onConfirm: () => {
        toast.info(`Restoring ${snap.vm} from differential block storage...`);
        setTimeout(() => {
          toast.success(`${snap.vm} restored successfully in 3.4 seconds.`);
        }, 1200);
      }
    });
  }

  function handleDelete(snap) {
    confirmDialog({
      title: `Delete snapshot ${snap.name}?`,
      description: 'This differential snapshot will be merged and freed from disk space.',
      confirmLabel: 'Delete Snapshot',
      danger: true,
      onConfirm: () => {
        snapshots = snapshots.filter(s => s.id !== snap.id);
        toast.success('Snapshot deleted');
        render();
      }
    });
  }

  function openTakeSnapshotDialog() {
    let name = `snap-${Date.now().toString().slice(-4)}`;
    let vm = 'kali-lab-01';
    let desc = 'Manual milestone snapshot';

    const modal = openDialog({
      title: 'Create Point-in-Time Snapshot',
      content: h('div', { class: 'space-y-3 pt-2 text-xs' },
        field({
          label: 'Target Virtual Machine',
          control: select({
            options: [
              { value: 'kali-lab-01', label: 'kali-lab-01 (10.10.1.5)' },
              { value: 'parrot-sec-01', label: 'parrot-sec-01 (10.10.1.8)' }
            ],
            value: vm,
            onChange: (e) => { vm = e.target.value; }
          })
        }),
        field({
          label: 'Snapshot Identifier',
          control: input({
            value: name,
            onInput: (e) => { name = e.target.value; }
          })
        }),
        field({
          label: 'Description / Purpose',
          control: input({
            value: desc,
            onInput: (e) => { desc = e.target.value; }
          })
        })
      ),
      actions: [
        button({
          variant: 'outline',
          size: 'sm',
          label: 'Cancel',
          onClick: () => modal.close()
        }),
        button({
          variant: 'primary',
          size: 'sm',
          label: 'Create Snapshot',
          onClick: () => {
            snapshots.unshift({
              id: `snap-${Date.now()}`,
              name,
              vm,
              size: '0.4 GB',
              created: 'Just now',
              desc
            });
            modal.close();
            toast.success(`Snapshot ${name} captured in 0.8s`);
            render();
          }
        })
      ]
    });
  }

  render();
  return PageContainer({ variant: 'default' }, host);
}

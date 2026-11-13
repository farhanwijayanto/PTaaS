import { h, icon, cx } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { pageHeader } from '../../components/layout/page-header.js';
import { PageContainer } from '../../components/layout/page-container.js';
import { button } from '../../components/ui/button.js';
import { toast } from '../../components/ui/toast.js';

export function PoliciesPage() {
  let policies = {
    maxSelfServiceVms: 3,
    hardCapVms: 6,
    grantValidityDays: 7,
    autoProvisionOnApproval: true
  };
  let isSaving = false;

  const host = h('div', { class: 'space-y-6 max-w-4xl select-none' });

  async function load() {
    try {
      const p = await api.policies.get();
      if (p) policies = { ...policies, ...p };
      render();
    } catch {}
  }

  function render() {
    host.innerHTML = '';

    const header = pageHeader({
      title: 'Kebijakan Kuota & Alokasi VM',
      description: 'Atur batas alokasi mandiri VM mahasiswa, masa berlaku token persetujuan, dan hard cap sistem.'
    });

    const card = h('div', { class: 'rounded-2xl border border-line bg-surface p-6 space-y-6 text-fg' },
      h('div', { class: 'space-y-1 border-b border-line pb-4' },
        h('h3', { class: 'text-sm font-semibold text-fg' }, 'Batas Kuota Mandiri Mahasiswa (Self-Service Limit)'),
        h('p', { class: 'text-xs text-muted' }, 'Jumlah maksimal instance VM yang dapat dibuat sendiri oleh setiap mahasiswa tanpa persetujuan instruktur.')
      ),

      h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-6' },
        h('div', { class: 'space-y-2' },
          h('label', { class: 'text-xs font-semibold text-fg block' }, 'Batas Standar Mandiri (Default Self-Service Limit)'),
          h('div', { class: 'flex items-center gap-2' },
            h('input', {
              type: 'number',
              min: 1,
              max: 5,
              value: policies.maxSelfServiceVms,
              class: 'w-24 rounded-lg border border-line bg-canvas p-2 text-sm font-mono text-fg text-center outline-none focus:border-accent',
              onInput: (e) => { policies.maxSelfServiceVms = Number(e.target.value); }
            }),
            h('span', { class: 'text-xs text-muted font-medium' }, 'VM per Mahasiswa')
          ),
          h('p', { class: 'text-[11px] text-muted' }, 'Bawaan sistem: 3 VM (sesuai standar praktikum lab)')
        ),

        h('div', { class: 'space-y-2' },
          h('label', { class: 'text-xs font-semibold text-fg block' }, 'Batas Maksimal Keras (Hard Cap Limit)'),
          h('div', { class: 'flex items-center gap-2' },
            h('input', {
              type: 'number',
              min: 3,
              max: 10,
              value: policies.hardCapVms,
              class: 'w-24 rounded-lg border border-line bg-canvas p-2 text-sm font-mono text-fg text-center outline-none focus:border-accent',
              onInput: (e) => { policies.hardCapVms = Number(e.target.value); }
            }),
            h('span', { class: 'text-xs text-muted font-medium' }, 'VM per Mahasiswa')
          ),
          h('p', { class: 'text-[11px] text-muted' }, 'Batas absolut walaupun mendapat persetujuan instruktur.')
        )
      ),

      h('div', { class: 'space-y-1 border-t border-line pt-6 pb-2' },
        h('h3', { class: 'text-sm font-semibold text-fg' }, 'Ketentuan Token Persetujuan (Approval Grant Token)'),
        h('p', { class: 'text-xs text-muted' }, 'Masa aktif token sekali pakai yang diberikan instruktur saat menyetujui permohonan.')
      ),

      h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-6' },
        h('div', { class: 'space-y-2' },
          h('label', { class: 'text-xs font-semibold text-fg block' }, 'Masa Berlaku Token (Grant Validity)'),
          h('div', { class: 'flex items-center gap-2' },
            h('input', {
              type: 'number',
              min: 1,
              max: 30,
              value: policies.grantValidityDays,
              class: 'w-24 rounded-lg border border-line bg-canvas p-2 text-sm font-mono text-fg text-center outline-none focus:border-accent',
              onInput: (e) => { policies.grantValidityDays = Number(e.target.value); }
            }),
            h('span', { class: 'text-xs text-muted font-medium' }, 'Hari (Days)')
          ),
          h('p', { class: 'text-[11px] text-muted' }, 'Token yang kadaluarsa tidak dapat dipakai untuk meluncurkan VM.')
        ),

        h('div', { class: 'space-y-2' },
          h('label', { class: 'text-xs font-semibold text-fg block' }, 'Auto-Provisioning Setelah Disetujui'),
          h('label', { class: 'flex items-center gap-2.5 cursor-pointer pt-1' },
            h('input', {
              type: 'checkbox',
              checked: policies.autoProvisionOnApproval,
              class: 'rounded border-line text-accent focus:ring-accent w-4 h-4',
              onChange: (e) => { policies.autoProvisionOnApproval = e.target.checked; }
            }),
            h('span', { class: 'text-xs text-fg font-medium' }, 'Otomatis aktifkan VM begitu instruktur menyetujui')
          ),
          h('p', { class: 'text-[11px] text-muted' }, 'Jika tidak dicentang, mahasiswa harus menekan tombol "Launch VM" sendiri.')
        )
      ),

      h('div', { class: 'border-t border-line pt-4 flex justify-end gap-3' },
        button({
          label: isSaving ? 'Menyimpan...' : 'Simpan Kebijakan',
          icon: isSaving ? 'loader' : 'check',
          variant: 'primary',
          size: 'sm',
          disabled: isSaving,
          onClick: async () => {
            isSaving = true;
            render();
            try {
              await api.policies.update(policies);
              toast.success('Kebijakan kuota berhasil diperbarui!');
            } catch (err) {
              toast.error(err.message || 'Gagal menyimpan kebijakan');
            } finally {
              isSaving = false;
              render();
            }
          }
        })
      )
    );

    host.appendChild(header);
    host.appendChild(card);
  }

  load();
  return PageContainer({ variant: 'default' }, host);
}

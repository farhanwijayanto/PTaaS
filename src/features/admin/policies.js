import { h } from '../../lib/dom.js';
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
    autoProvisionOnApproval: true,
    maxTotalVms: 50,
    maxRunningVms: 25,
    maxConcurrentCreations: 3,
  };
  let isSaving = false;
  let loadError = null;

  const host = h('div', { class: 'space-y-6 max-w-4xl select-none' });

  async function load() {
    try {
      const p = await api.policies.get();
      if (p) policies = { ...policies, ...p };
      loadError = null;
    } catch (err) {
      loadError = err.message || 'Gagal memuat kebijakan sistem.';
    } finally {
      render();
    }
  }

  function numberField({ id, label, value, min, max, unit, hint, onChange }) {
    return h('div', { class: 'space-y-2' },
      h('label', { for: id, class: 'text-xs font-semibold text-fg block' }, label),
      h('div', { class: 'flex items-center gap-2' },
        h('input', {
          id,
          type: 'number',
          min,
          max,
          value,
          class: 'w-24 rounded-lg border border-line bg-canvas p-2 text-sm font-mono text-fg text-center focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
          onInput: (e) => {
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed)) onChange(parsed);
          },
        }),
        h('span', { class: 'text-xs text-muted font-medium' }, unit)
      ),
      h('p', { class: 'text-[11px] text-muted' }, hint)
    );
  }

  function render() {
    host.innerHTML = '';

    const header = pageHeader({
      title: 'Kebijakan Kuota & Kapasitas VM',
      description: 'Atur batas alokasi mandiri mahasiswa, masa berlaku token persetujuan, dan batas kapasitas host Docker.',
    });

    const errorBanner = loadError
      ? h('div', {
          role: 'alert',
          class: 'rounded-xl border p-4 text-xs',
          style: 'background-color: var(--danger-bg); border-color: var(--danger-border); color: var(--danger-text);',
        }, loadError)
      : null;

    const card = h('div', { class: 'rounded-2xl border border-line bg-surface p-6 space-y-6 text-fg' },
      h('div', { class: 'space-y-1 border-b border-line pb-4' },
        h('h3', { class: 'text-sm font-semibold text-fg' }, 'Batas Kuota Mandiri Mahasiswa (Self-Service Limit)'),
        h('p', { class: 'text-xs text-muted' }, 'Jumlah maksimal instance VM yang dapat dibuat sendiri oleh setiap mahasiswa tanpa persetujuan instruktur.')
      ),

      h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-6' },
        numberField({
          id: 'policy-max-self-service',
          label: 'Batas Standar Mandiri (Default Self-Service Limit)',
          value: policies.maxSelfServiceVms,
          min: 1,
          max: 10,
          unit: 'VM per Mahasiswa',
          hint: 'Bawaan sistem: 3 VM (sesuai standar praktikum lab).',
          onChange: (v) => { policies.maxSelfServiceVms = v; },
        }),
        numberField({
          id: 'policy-hard-cap',
          label: 'Batas Maksimal Keras (Hard Cap Limit)',
          value: policies.hardCapVms,
          min: 1,
          max: 20,
          unit: 'VM per Mahasiswa',
          hint: 'Batas absolut walaupun mendapat persetujuan instruktur.',
          onChange: (v) => { policies.hardCapVms = v; },
        })
      ),

      h('div', { class: 'space-y-1 border-t border-line pt-6 pb-2' },
        h('h3', { class: 'text-sm font-semibold text-fg' }, 'Kapasitas Host & Konkurensi Provisioning'),
        h('p', { class: 'text-xs text-muted' }, 'Lindungi server Docker dari kehabisan RAM, CPU, atau pembuatan kontainer serentak berlebih.')
      ),

      h('div', { class: 'grid grid-cols-1 sm:grid-cols-3 gap-6' },
        numberField({
          id: 'policy-max-total-vms',
          label: 'Maksimal Total VM (MAX_TOTAL_VMS)',
          value: policies.maxTotalVms,
          min: 1,
          max: 500,
          unit: 'Total VM',
          hint: 'Jumlah total VM di seluruh platform sebelum permintaan baru ditolak (503).',
          onChange: (v) => { policies.maxTotalVms = v; },
        }),
        numberField({
          id: 'policy-max-running-vms',
          label: 'Maksimal VM Aktif (MAX_RUNNING_VMS)',
          value: policies.maxRunningVms,
          min: 1,
          max: 500,
          unit: 'Running VM',
          hint: 'Batas kontainer berjalan bersamaan untuk mencegah overload host.',
          onChange: (v) => { policies.maxRunningVms = v; },
        }),
        numberField({
          id: 'policy-max-concurrent-creations',
          label: 'Pembuatan Paralel (Max Concurrent)',
          value: policies.maxConcurrentCreations,
          min: 1,
          max: 20,
          unit: 'Antrean paralel',
          hint: 'Jumlah maksimum kontainer yang sedang diprovisioning bersamaan.',
          onChange: (v) => { policies.maxConcurrentCreations = v; },
        })
      ),

      h('div', { class: 'space-y-1 border-t border-line pt-6 pb-2' },
        h('h3', { class: 'text-sm font-semibold text-fg' }, 'Ketentuan Token Persetujuan (Approval Grant Token)'),
        h('p', { class: 'text-xs text-muted' }, 'Masa aktif token sekali pakai yang diberikan instruktur saat menyetujui permohonan.')
      ),

      h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-6' },
        numberField({
          id: 'policy-grant-validity',
          label: 'Masa Berlaku Token (Grant Validity)',
          value: policies.grantValidityDays,
          min: 1,
          max: 30,
          unit: 'Hari (Days)',
          hint: 'Token yang kadaluarsa tidak dapat dipakai untuk meluncurkan VM.',
          onChange: (v) => { policies.grantValidityDays = v; },
        }),

        h('div', { class: 'space-y-2' },
          h('span', { class: 'text-xs font-semibold text-fg block' }, 'Auto-Provisioning Setelah Disetujui'),
          h('label', { for: 'policy-auto-provision', class: 'flex items-center gap-2.5 cursor-pointer pt-1' },
            h('input', {
              id: 'policy-auto-provision',
              type: 'checkbox',
              checked: policies.autoProvisionOnApproval,
              class: 'rounded border-line text-accent focus:ring-accent w-4 h-4 cursor-pointer',
              onChange: (e) => { policies.autoProvisionOnApproval = e.target.checked; },
            }),
            h('span', { class: 'text-xs text-fg font-medium' }, 'Otomatis aktifkan VM begitu instruktur menyetujui')
          ),
          h('p', { class: 'text-[11px] text-muted' }, 'Jika tidak dicentang, mahasiswa harus menekan tombol "Launch VM" sendiri.')
        )
      ),

      h('div', { class: 'border-t border-line pt-4 flex justify-end gap-3' },
        button({
          attrs: { id: 'save-policies-btn' },
          label: isSaving ? 'Menyimpan...' : 'Simpan Kebijakan',
          icon: isSaving ? 'loader' : 'check',
          variant: 'primary',
          size: 'sm',
          disabled: isSaving,
          onClick: async () => {
            isSaving = true;
            render();
            try {
              const saved = await api.policies.update(policies);
              if (saved) policies = { ...policies, ...saved };
              toast.success('Kebijakan kuota dan kapasitas berhasil diperbarui.');
            } catch (err) {
              toast.error(err.message || 'Gagal menyimpan kebijakan');
            } finally {
              isSaving = false;
              render();
            }
          },
        })
      )
    );

    host.appendChild(header);
    if (errorBanner) host.appendChild(errorBanner);
    host.appendChild(card);
  }

  render();
  void load();
  return PageContainer({ variant: 'default' }, host);
}

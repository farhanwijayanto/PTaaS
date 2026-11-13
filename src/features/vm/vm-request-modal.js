import { h, icon, cx } from '../../lib/dom.js';
import { api } from '../../lib/api.js';
import { toast } from '../../components/ui/toast.js';
import { button } from '../../components/ui/button.js';
import { input, field, select } from '../../components/ui/input.js';

export function openVmRequestModal({ initialSpecs = {}, onSuccess = () => {} } = {}) {
  const form = {
    name: initialSpecs.name || 'kali-advanced-lab',
    os: initialSpecs.os || 'kali',
    vcpu: initialSpecs.vcpu || 2,
    ram: initialSpecs.ram || 4,
    disk: initialSpecs.disk || 30,
    purpose: '',
    durationDays: 14
  };

  let isSubmitting = false;

  const backdrop = h('div', {
    class: 'fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200'
  });

  const modal = h('div', {
    class: 'relative w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 text-fg',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'modal-title'
  });

  function close() {
    backdrop.classList.add('animate-out', 'fade-out', 'duration-150');
    modal.classList.add('animate-out', 'zoom-out-95', 'duration-150');
    setTimeout(() => {
      if (backdrop.parentElement) backdrop.parentElement.removeChild(backdrop);
    }, 150);
  }

  // Close on Escape key
  function handleKeyDown(e) {
    if (e.key === 'Escape') close();
  }
  window.addEventListener('keydown', handleKeyDown, { once: true });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  function render() {
    modal.innerHTML = '';

    // Header
    const header = h('div', { class: 'flex items-start justify-between border-b border-line pb-4' },
      h('div', { class: 'space-y-1' },
        h('h3', { id: 'modal-title', class: 'text-base font-semibold tracking-tight text-fg flex items-center gap-2' },
          icon('clipboard-pen', 'w-5 h-5 text-accent'),
          'Ajukan VM Tambahan (Request Extra VM)'
        ),
        h('p', { class: 'text-xs text-muted leading-relaxed' },
          'Batas 3 VM mandiri Anda telah tercapai. Kirim permohonan ke instruktur untuk alokasi slot tambahan.'
        )
      ),
      h('button', {
        type: 'button',
        class: 'text-muted hover:text-fg p-1 rounded-lg hover:bg-raised transition-colors',
        onClick: close,
        'aria-label': 'Close dialog'
      }, icon('x', 'w-4 h-4'))
    );

    // Limit Banner
    const quotaBanner = h('div', {
      class: 'rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3.5 flex items-start gap-3 text-xs'
    },
      icon('info', 'w-4 h-4 text-[var(--warning-text)] shrink-0 mt-0.5'),
      h('div', { class: 'space-y-1 flex-1 text-muted' },
        h('p', { class: 'font-semibold text-[var(--warning-text)]' }, 'Kuota Mandiri Penuh (3/3 VM Aktif)'),
        h('p', { class: 'text-[11px] leading-relaxed' },
          'Instruktur akan meninjau tujuan lab Anda. Setelah disetujui, VM akan langsung aktif secara otomatis.'
        )
      )
    );

    // Form inputs
    const formFields = h('div', { class: 'space-y-4 text-xs' },
      // Name & OS row
      h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-3' },
        field({
          label: 'Nama Virtual Machine',
          input: input({
            value: form.name,
            placeholder: 'e.g. kali-exam-prep',
            onInput: (e) => { form.name = e.target.value.trim().toLowerCase(); }
          })
        }),
        h('div', { class: 'space-y-1.5' },
          h('label', { class: 'font-medium text-muted block text-[11px]' }, 'Sistem Operasi (OS)'),
          h('select', {
            class: 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg outline-none focus:border-accent cursor-pointer',
            onChange: (e) => { form.os = e.target.value; }
          },
            h('option', { value: 'kali', selected: form.os === 'kali' }, 'Kali Linux 2024.3'),
            h('option', { value: 'parrot', selected: form.os === 'parrot' }, 'Parrot Security 6.1'),
            h('option', { value: 'ubuntu', selected: form.os === 'ubuntu' }, 'Ubuntu 24.04 LTS')
          )
        )
      ),

      // Hardware Specs & Duration
      h('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-3' },
        h('div', { class: 'space-y-1.5' },
          h('label', { class: 'font-medium text-muted block text-[11px]' }, 'Spesifikasi Komputasi'),
          h('select', {
            class: 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg outline-none focus:border-accent cursor-pointer',
            onChange: (e) => {
              const val = e.target.value;
              if (val === 'heavy') { form.vcpu = 4; form.ram = 8; form.disk = 50; }
              else { form.vcpu = 2; form.ram = 4; form.disk = 30; }
            }
          },
            h('option', { value: 'standard' }, 'Standard: 2 vCPU · 4 GB RAM · 30 GB'),
            h('option', { value: 'heavy' }, 'Heavy: 4 vCPU · 8 GB RAM · 50 GB')
          )
        ),
        h('div', { class: 'space-y-1.5' },
          h('label', { class: 'font-medium text-muted block text-[11px]' }, 'Durasi Kebutuhan'),
          h('select', {
            class: 'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg outline-none focus:border-accent cursor-pointer',
            onChange: (e) => { form.durationDays = Number(e.target.value); }
          },
            h('option', { value: '7' }, '7 Hari (Tugas Modul)'),
            h('option', { value: '14', selected: true }, '14 Hari (Project / UTS)'),
            h('option', { value: '30' }, '30 Hari (Penelitian / Skripsi)')
          )
        )
      ),

      // Purpose textarea (min 15 chars)
      h('div', { class: 'space-y-1.5' },
        h('div', { class: 'flex justify-between items-center' },
          h('label', { class: 'font-medium text-muted text-[11px]' }, 'Alasan & Tujuan Permohonan (Justification)'),
          h('span', {
            id: 'char-counter',
            class: cx('text-[10px] font-mono', form.purpose.length >= 15 ? 'text-[var(--success-text)]' : 'text-[var(--warning-text)]')
          }, `${form.purpose.length}/15 min`)
        ),
        h('textarea', {
          rows: 3,
          placeholder: 'Jelaskan modul lab, praktikum, atau tugas yang membutuhkan alokasi VM tambahan ini (min. 15 karakter)...',
          class: 'w-full rounded-lg border border-line bg-canvas p-3 text-xs text-fg outline-none focus:border-accent leading-relaxed resize-none',
          onInput: (e) => {
            form.purpose = e.target.value;
            const counter = document.getElementById('char-counter');
            if (counter) {
              counter.textContent = `${form.purpose.length}/15 min`;
              counter.className = cx('text-[10px] font-mono', form.purpose.length >= 15 ? 'text-[var(--success-text)]' : 'text-[var(--warning-text)]');
            }
          }
        })
      )
    );

    // Impact preview card
    const impactCard = h('div', {
      class: 'rounded-xl border border-line bg-raised/50 p-3.5 space-y-2 text-[11px]'
    },
      h('div', { class: 'flex justify-between text-muted' },
        h('span', {}, 'Status Kuota Anda:'),
        h('span', { class: 'font-mono text-fg font-medium' }, '3/3 VM Aktif (Maksimal Mandiri)')
      ),
      h('div', { class: 'flex justify-between text-muted' },
        h('span', {}, 'Dampak Persetujuan:'),
        h('span', { class: 'font-mono text-accent font-semibold' }, 'Slot ke-4 Diizinkan (Total 4 VM)')
      ),
      h('div', { class: 'flex justify-between text-muted' },
        h('span', {}, 'Peninjau Alokasi:'),
        h('span', { class: 'font-medium text-fg' }, 'Dr. Sarah Johnson (CS-401)')
      )
    );

    // Actions
    const actions = h('div', { class: 'flex items-center justify-end gap-2.5 pt-2 border-t border-line' },
      button({
        label: 'Batal',
        variant: 'secondary',
        size: 'sm',
        onClick: close
      }),
      button({
        label: isSubmitting ? 'Mengirim...' : 'Kirim Permohonan',
        icon: isSubmitting ? 'loader' : 'send',
        variant: 'primary',
        size: 'sm',
        disabled: isSubmitting,
        onClick: async () => {
          if (!form.name || form.name.length < 3) {
            toast.error('Nama VM minimal 3 karakter');
            return;
          }
          if (!form.purpose || form.purpose.trim().length < 15) {
            toast.error('Mohon isi alasan kebutuhan minimal 15 karakter');
            return;
          }

          isSubmitting = true;
          render();

          try {
            await api.vmRequests.create({
              name: form.name,
              os: form.os,
              vcpu: form.vcpu,
              ram: form.ram,
              disk: form.disk,
              purpose: form.purpose.trim(),
              durationDays: form.durationDays
            });
            toast.success('Permohonan VM tambahan berhasil dikirim ke instruktur!');
            close();
            onSuccess();
          } catch (err) {
            isSubmitting = false;
            toast.error(err.message || 'Gagal mengirim permohonan');
            render();
          }
        }
      })
    );

    modal.appendChild(header);
    modal.appendChild(quotaBanner);
    modal.appendChild(formFields);
    modal.appendChild(impactCard);
    modal.appendChild(actions);
  }

  render();
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
}

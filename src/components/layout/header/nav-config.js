export const HERO_ACTIVE = null; // null | 'features'

export const NAV_CONFIG = [
  {
    id: 'features',
    labelEn: 'Features',
    labelId: 'Fitur',
    href: '#features',
    sections: ['features']
  },
  {
    id: 'platform',
    labelEn: 'Platform',
    labelId: 'Platform',
    href: '#platform',
    sections: ['lifecycle', 'isolation', 'branching'],
    hasDropdown: true,
    children: [
      {
        id: 'lifecycle',
        labelEn: 'Lifecycle',
        labelId: 'Siklus',
        descEn: 'Scale-to-zero auto resource reclaim',
        descId: 'Pelepasan sumber daya otomatis saat idle',
        icon: 'refresh-cw',
        href: '#lifecycle'
      },
      {
        id: 'isolation',
        labelEn: 'Isolation',
        labelId: 'Isolasi',
        descEn: 'Open vSwitch VXLAN 0-leak network isolation',
        descId: 'Isolasi jaringan Open vSwitch VXLAN 0 bocor',
        icon: 'shield',
        href: '#isolation'
      },
      {
        id: 'branching',
        labelEn: 'Branching',
        labelId: 'Branching',
        descEn: 'Instant copy-on-write student lab clones',
        descId: 'Kloning instan mesin lab mahasiswa CoW',
        icon: 'git-branch',
        href: '#branching'
      }
    ]
  },
  {
    id: 'stepper',
    labelEn: 'How it works',
    labelId: 'Cara kerja',
    href: '#stepper',
    sections: ['stepper']
  },
  {
    id: 'security',
    labelEn: 'Security',
    labelId: 'Keamanan',
    href: '#security',
    sections: ['security']
  },
  {
    id: 'compliance',
    labelEn: 'Compliance',
    labelId: 'Kepatuhan',
    href: '#compliance',
    sections: ['compliance']
  }
];

export function getTrackedSectionIds() {
  return NAV_CONFIG.flatMap((item) => item.sections || []);
}

export function mapSectionToNavId(sectionId) {
  if (!sectionId) return null;
  for (const item of NAV_CONFIG) {
    if (item.sections && item.sections.includes(sectionId)) return item.id;
  }
  return null;
}

export function assertNavSectionOrder(root = document) {
  const ids = getTrackedSectionIds();
  const errors = [];
  let prevTop = -Infinity;
  for (const id of ids) {
    const matches = root.querySelectorAll(`[id="${id}"]`);
    if (matches.length === 0) {
      errors.push(`Missing section #${id}`);
      continue;
    }
    if (matches.length > 1) {
      errors.push(`Duplicate section #${id} (${matches.length} found)`);
    }
    const top = matches[0].getBoundingClientRect().top + window.scrollY;
    if (top < prevTop) {
      errors.push(`Section #${id} (top=${Math.round(top)}) is out of DOM order (prevTop=${Math.round(prevTop)})`);
    }
    prevTop = top;
  }
  if (errors.length > 0 && typeof console !== 'undefined') {
    console.error('[PTaaS Nav Audit] Section order/id errors:', errors);
  }
  return errors;
}

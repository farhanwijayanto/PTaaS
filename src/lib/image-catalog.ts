export interface ImageCatalogEntry {
  id: string;
  os: 'kali' | 'parrot' | 'ubuntu';
  label: string;
  description: string;
  image: string;
  protocol: 'rdp' | 'vnc';
  defaultCpu: number;
  defaultRamMb: number;
  defaultDiskGb: number;
  tools: string[];
  available: boolean;
  sshPort: number;
  rdpPort: number;
  vncPort: number;
}

export const VM_NAME_REGEX = /^[a-z][a-z0-9-]{2,30}$/;
export const ALLOWED_VCPU = [1, 2, 4] as const;
export const ALLOWED_RAM_GB = [2, 4, 8] as const;
export const ALLOWED_DISK_GB = [20, 30, 50] as const;

export const DEFAULT_KALI_IMAGE = 'kasmweb/kali-rolling-desktop:1.15.0';

export function isPinnedImageRef(imageRef: string): boolean {
  const ref = String(imageRef || '').trim();
  if (!ref) return false;
  if (/:latest$/i.test(ref)) return false;
  return ref.includes('@sha256:') || ref.includes(':');
}

export function getGoldenKaliImage(): string {
  const configured = (process.env.KALI_IMAGE || process.env.PTAAS_VM_IMAGE || DEFAULT_KALI_IMAGE).trim();
  if (!isPinnedImageRef(configured)) {
    throw new Error(
      `Configured KALI_IMAGE ("${configured}") must be pinned to an exact tag or @sha256 digest (never :latest).`
    );
  }
  return configured;
}

export function getImageCatalog(): ImageCatalogEntry[] {
  const kaliImage = getGoldenKaliImage();
  return [
    {
      id: 'kali-2024.3',
      os: 'kali',
      label: 'Kali Linux 2024.3',
      description: 'XFCE Desktop, RDP/VNC and isolated SSH PTY with pre-baked pentesting toolkit',
      image: kaliImage,
      protocol: 'rdp',
      defaultCpu: 2,
      defaultRamMb: 4096,
      defaultDiskGb: 30,
      tools: [
        'Nmap',
        'Metasploit',
        'Burp Suite',
        'Wireshark',
        'SQLmap',
        'Hydra',
        'John the Ripper',
      ],
      available: true,
      sshPort: 2222,
      rdpPort: 3389,
      vncPort: 5901,
    },
    {
      id: 'parrot-6.1',
      os: 'parrot',
      label: 'Parrot Security 6.1',
      description: 'MATE Desktop security distribution (coming soon)',
      image: 'parrotsec/security:6.1',
      protocol: 'rdp',
      defaultCpu: 2,
      defaultRamMb: 4096,
      defaultDiskGb: 30,
      tools: ['Nmap', 'Metasploit', 'Wireshark', 'SQLmap'],
      available: false,
      sshPort: 2222,
      rdpPort: 3389,
      vncPort: 5901,
    },
    {
      id: 'ubuntu-24.04',
      os: 'ubuntu',
      label: 'Ubuntu 24.04 LTS',
      description: 'Ubuntu Noble desktop & dev sandbox (coming soon)',
      image: 'kasmweb/ubuntu-noble-desktop:1.15.0',
      protocol: 'rdp',
      defaultCpu: 2,
      defaultRamMb: 4096,
      defaultDiskGb: 30,
      tools: ['Nmap', 'Wireshark'],
      available: false,
      sshPort: 2222,
      rdpPort: 3389,
      vncPort: 5901,
    },
  ];
}

/**
 * Resolve an allow-listed catalog entry from a client-supplied catalog ID (or legacy OS alias 'kali').
 * Never accepts arbitrary image names or URLs from the client.
 */
export function resolveCatalogEntry(imageIdOrOs?: string): ImageCatalogEntry | null {
  const catalog = getImageCatalog();
  const key = String(imageIdOrOs || 'kali-2024.3').trim().toLowerCase();
  const exact = catalog.find((c) => c.id.toLowerCase() === key);
  if (exact) return exact;
  if (key === 'kali') return catalog.find((c) => c.id === 'kali-2024.3') || null;
  return null;
}

export function validateVmCreateSpec(input: {
  name?: string;
  imageId?: string;
  os?: string;
  vcpu?: number;
  ram?: number;
  disk?: number;
}): {
  ok: true;
  name: string;
  catalog: ImageCatalogEntry;
  vcpu: number;
  ramGb: number;
  diskGb: number;
} | { ok: false; code: string; message: string } {
  const rawName = String(input.name || '').trim();
  if (!VM_NAME_REGEX.test(rawName)) {
    return {
      ok: false,
      code: 'invalid_name',
      message:
        'VM name must be 3-31 characters, start with a lowercase letter, and contain only lowercase letters, numbers, and hyphens.',
    };
  }

  const catalog = resolveCatalogEntry(input.imageId || input.os || 'kali-2024.3');
  if (!catalog || !catalog.available) {
    return {
      ok: false,
      code: 'invalid_image',
      message: 'Selected OS image is not available in the platform catalog.',
    };
  }

  const vcpu = Number(input.vcpu ?? catalog.defaultCpu);
  const ramGb = Number(input.ram ?? Math.round(catalog.defaultRamMb / 1024));
  const diskGb = Number(input.disk ?? catalog.defaultDiskGb);

  if (!ALLOWED_VCPU.includes(vcpu as (typeof ALLOWED_VCPU)[number])) {
    return {
      ok: false,
      code: 'invalid_spec',
      message: `vCPU must be one of: ${ALLOWED_VCPU.join(', ')}.`,
    };
  }
  if (!ALLOWED_RAM_GB.includes(ramGb as (typeof ALLOWED_RAM_GB)[number])) {
    return {
      ok: false,
      code: 'invalid_spec',
      message: `RAM must be one of: ${ALLOWED_RAM_GB.join(', ')} GB.`,
    };
  }
  if (!ALLOWED_DISK_GB.includes(diskGb as (typeof ALLOWED_DISK_GB)[number])) {
    return {
      ok: false,
      code: 'invalid_spec',
      message: `Disk must be one of: ${ALLOWED_DISK_GB.join(', ')} GB.`,
    };
  }

  return { ok: true, name: rawName, catalog, vcpu, ramGb, diskGb };
}

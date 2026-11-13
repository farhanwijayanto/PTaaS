import type { Metadata } from 'next';
import '../lib/xterm/xterm.css';
import '../styles/tokens.css';
import '../styles/app.css';

export const metadata: Metadata = {
  title: 'PTaaS Cloud',
  description: 'Penetration Testing as a Service — isolated browser pentest lab platform (Demo Mode).',
};

const themeInitScript = `
(function() {
  try {
    var d = document.documentElement;
    var mode = localStorage.getItem('ptaas.theme') || 'system';
    var resolved = mode === 'system'
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : (mode === 'light' ? 'light' : 'dark');
    d.dataset.theme = resolved;
    d.style.colorScheme = resolved;
    d.lang = localStorage.getItem('ptaas.lang') || 'en';
    if (localStorage.getItem('ptaas.sidebar') === 'collapsed') d.dataset.sb = 'collapsed';
  } catch (e) {}
})();
`;

const tailwindConfigScript = `
(function() {
  function applyConfig() {
    if (!window.tailwind) return;
    var token = function(name) { return 'rgb(var(--' + name + ') / <alpha-value>)'; };
    window.tailwind.config = {
      theme: {
        extend: {
          colors: {
            canvas: token('canvas'), surface: token('surface'), raised: token('raised'),
            line: { DEFAULT: token('line'), strong: token('line-strong') },
            fg: token('fg'), muted: token('muted'), subtle: token('subtle'),
            accent: token('accent-rgb'), danger: token('danger'), warn: token('warn'),
            bg: 'var(--bg)',
            'surface-1': 'var(--surface-1)',
            'surface-2': 'var(--surface-2)',
            'surface-3': 'var(--surface-3)',
            'border-subtle': 'var(--border-subtle)',
            'border-default': 'var(--border-default)',
            'border-strong': 'var(--border-strong)',
            'text-primary': 'var(--text-primary)',
            'text-secondary': 'var(--text-secondary)',
            'text-muted': 'var(--text-muted)',
            'text-disabled': 'var(--text-disabled)',
            'text-inverse': 'var(--text-inverse)',
            'accent-fill': 'var(--accent)',
            'accent-text': 'var(--accent-text)',
            'accent-bg': 'var(--accent-bg)',
            'accent-border': 'var(--accent-border)',
            'ink-950': 'var(--ink-950)',
            'ink-900': 'var(--ink-900)',
            'ink-850': 'var(--ink-850)',
            'ink-800': 'var(--ink-800)',
            'ink-700': 'var(--ink-700)',
            'ink-600': 'var(--ink-600)',
            'ink-500': 'var(--ink-500)',
            'ink-400': 'var(--ink-400)'
          },
          fontFamily: {
            sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
            mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
          }
        }
      }
    };
  }
  applyConfig();
  window.addEventListener('load', applyConfig);
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark light" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script src="https://cdn.tailwindcss.com" />
        <script dangerouslySetInnerHTML={{ __html: tailwindConfigScript }} />
        <script defer src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js" />
      </head>
      <body className="bg-canvas font-sans text-fg antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

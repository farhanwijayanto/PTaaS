# PTaaS Color & Token System

All UI colors in PTaaS are defined in a single source of truth: [`src/styles/tokens.css`](../src/styles/tokens.css).
Components must never hard-code hex values, numeric `rgb()`/`rgba()` colors, or raw Tailwind palette classes (`text-zinc-*`, `bg-emerald-*`, etc.). Use `npm run check:colors` to verify zero violations.

## 1. Surface Scopes

Three scopes redefine the same semantic variables so nested dark panels inside a light page (e.g., the Hero Terminal, Isolation Diagram, Branching Graph, Boot Log, and Security Dark Band) always resolve light ink on dark surfaces:

- `:root[data-theme="dark"]` & `[data-surface="dark"]`
- `:root[data-theme="light"]` & `[data-surface="light"]`

To force a dark subtree inside a light page, add `data-surface="dark"` on the panel wrapper.

## 2. Multi-Tier Ink & Paper Scales

### Ink Scale (Dark Neutrals)
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `--ink-950` | `#090a0d` | Deepest panels, terminal body, SVG diagram canvas |
| `--ink-900` | `#0f1115` | Dark mode page background (`--bg`) |
| `--ink-850` | `#14171d` | Dark security band section background |
| `--ink-800` | `#171a20` | Dark cards, terminal title bar, stacked back card |
| `--ink-700` | `#20242c` | Elevated dark surfaces, VM nodes, status banners |
| `--ink-600` | `#2b303a` | Crisp dark borders |
| `--ink-500` | `#3a404c` | Top highlight bevels & strong borders |
| `--ink-400` | `#525a69` | Subtle dark icons & dividers |

### Paper Scale (Light Mode Tiers)
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `--paper-50` | `#ffffff` | Elevated cards (`--surface-1`) |
| `--paper-100` | `#f6f7f9` | Light mode page background (`--bg`) |
| `--paper-150` | `#f1f3f6` | Secondary raised surfaces (`--surface-2`) |
| `--paper-200` | `#e6e9ef` | Hover / active states (`--surface-3`) |
| `--paper-300` | `#d2d7df` | Default borders (`--border-default`) |
| `--paper-400` | `#b6bdc9` | Strong borders (`--border-strong`) |

## 3. Semantic Tokens

| Category | Token | Light | Dark |
| :--- | :--- | :--- | :--- |
| **Backgrounds** | `--bg` | `#f6f7f9` | `#0f1115` |
| | `--surface-1` | `#ffffff` | `#171a20` |
| | `--surface-2` | `#f1f3f6` | `#20242c` |
| **Text** | `--text-primary` | `#0f1115` | `#f2f4f7` |
| | `--text-secondary` | `#3c4452` | `#c7cdd6` |
| | `--text-muted` | `#586170` | `#98a1b0` |
| | `--text-inverse` | `#ffffff` | `#090a0d` |
| **Accent** | `--accent` | `#10b981` | `#10b981` |
| | `--accent-text` | `#007a55` | `#34d399` |
| | `--accent-bg` | `rgba(0, 122, 85, 0.08)` | `rgba(16, 185, 129, 0.12)` |
| **Status** | `--success-text` | `#047857` | `#6ee7b7` |
| | `--warning-text` | `#92400e` | `#fcd34d` |
| | `--danger-text` | `#b42318` | `#fca5a5` |
| | `--info-text` | `#0369a1` | `#7dd3fc` |

> **Rule**: Never use `--accent` (`#10b981`) as body or eyebrow text on light surfaces (it fails WCAG AA at ~2.5:1). Always use `--accent-text` (`#007a55` in light mode, ~5.3:1).

## 4. Customizing the Palette

1. Open the app in development mode and press **`Ctrl+Shift+K`** (or append `?tune=1` to the URL) to open the **Dev Color Tuner**.
2. Adjust tokens live and verify the **AA/AAA** contrast badges in real time.
3. Click **Copy CSS** or **Download CSS** and paste the updated values into `src/styles/tokens.css`.
4. Inspect all swatches at [`/dev/colors`](/dev/colors) (dev-only) and run `npm run check:colors`.

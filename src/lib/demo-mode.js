/**
 * Demo Mode helper.
 * Defaults to true when NEXT_PUBLIC_DEMO_MODE / DEMO_MODE are missing,
 * so a misconfigured deployment can never fall back to non-demo behavior.
 */
export function isDemoMode() {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === 'false') return false;
    if (process.env.DEMO_MODE === 'false') return false;
  }
  return true;
}

export const DEMO_BANNER_TEXT = 'Demo simulation: not a real shell';
export const DEMO_DESKTOP_BANNER_TEXT = 'Demo simulation: static preview (no live VNC/Guacamole tunnel)';
export const DEMO_SCRIPT_BANNER_TEXT = 'Demo simulation: canned output (no script execution)';

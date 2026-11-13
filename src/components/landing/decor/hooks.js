// Shared hooks for starting/stopping decorative loops: useInView & usePageVisibility.
// Guarantees all continuous animations pause when off-screen or when the browser tab is hidden.

const viewCallbacks = new WeakMap();
let sharedObserver = null;

function getSharedObserver() {
  if (sharedObserver || typeof IntersectionObserver === 'undefined') return sharedObserver;
  sharedObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target;
      const isVisible = entry.isIntersecting;
      el.setAttribute('data-in-view', isVisible ? 'true' : 'false');
      const cb = viewCallbacks.get(el);
      if (cb) cb(isVisible, entry);
    }
  }, {
    rootMargin: '40px 0px 40px 0px',
    threshold: 0.05
  });
  return sharedObserver;
}

/**
 * Observes `element` and toggles `data-in-view="true|false"` plus invokes `onChange(isVisible)`.
 * Returns a cleanup function.
 */
export function useInView(element, onChange, { once = false } = {}) {
  if (!element || typeof IntersectionObserver === 'undefined') {
    onChange?.(true);
    return () => {};
  }

  element.setAttribute('data-in-view', 'false');
  const obs = getSharedObserver();

  viewCallbacks.set(element, (isVisible, entry) => {
    onChange?.(isVisible, entry);
    if (isVisible && once) {
      obs.unobserve(element);
      viewCallbacks.delete(element);
    }
  });

  obs.observe(element);

  return () => {
    obs.unobserve(element);
    viewCallbacks.delete(element);
  };
}

/**
 * Tracks `document.hidden` and sets `data-page-hidden="true|false"` on `<html>`.
 * Invokes `onChange(isVisible)` whenever tab visibility changes.
 */
export function usePageVisibility(onChange) {
  if (typeof document === 'undefined') return () => {};

  const handleVisibility = () => {
    const isVisible = !document.hidden;
    document.documentElement.setAttribute('data-page-hidden', isVisible ? 'false' : 'true');
    onChange?.(isVisible);
  };

  document.addEventListener('visibilitychange', handleVisibility);
  handleVisibility();

  return () => {
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

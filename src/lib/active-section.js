import {
  HERO_ACTIVE,
  getTrackedSectionIds,
  mapSectionToNavId,
  assertNavSectionOrder,
} from '../components/layout/header/nav-config.js';
import {
  onSharedScroll,
  getCurrentScrollY,
  scrollToTarget,
  resolveSectionAlias,
} from './scroll-controller.js';
import { on } from './events.js';

export function getSpyOffset(headerHeight, innerHeight) {
  return Math.max(headerHeight + 24, Math.round(innerHeight * 0.35));
}

/**
 * Pure deterministic scroll-spy computation (zero DOM reads).
 * - Reference line: scrollY + max(headerHeight + 24, 0.35 * innerHeight)
 * - Bottom rule: scrollY + innerHeight >= documentHeight - 2 -> last section
 * - Hero rule: refY < sections[0].top -> heroActive (default null)
 * - Hysteresis: +/-8px around section boundaries to prevent flicker
 */
export function computeActiveSection({
  scrollY,
  innerHeight,
  documentHeight,
  headerHeight,
  sections,
  currentSectionId = null,
  heroActive = HERO_ACTIVE,
  hysteresis = 8,
}) {
  if (!sections || sections.length === 0) return heroActive;

  if (scrollY + innerHeight >= documentHeight - 2) {
    return sections[sections.length - 1].id;
  }

  const spyOffset = getSpyOffset(headerHeight, innerHeight);
  const refY = scrollY + spyOffset;

  let rawIndex = -1;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].top <= refY) rawIndex = i;
    else break;
  }

  if (rawIndex === -1) {
    if (currentSectionId === sections[0].id && refY >= sections[0].top - hysteresis) {
      return sections[0].id;
    }
    return heroActive;
  }

  const candidateId = sections[rawIndex].id;
  if (!currentSectionId || currentSectionId === candidateId) {
    return candidateId;
  }

  const curIdx = sections.findIndex((s) => s.id === currentSectionId);
  if (curIdx === -1) return candidateId;

  if (rawIndex > curIdx) {
    // Moving down: require crossing candidate top by +hysteresis
    if (refY >= sections[rawIndex].top + hysteresis) return candidateId;
    return currentSectionId;
  } else {
    // Moving up: require crossing current section top by -hysteresis
    if (refY <= sections[curIdx].top - hysteresis) return candidateId;
    return currentSectionId;
  }
}

// Single source of truth state for the landing page
let state = {
  sectionId: HERO_ACTIVE,
  navId: HERO_ACTIVE ? mapSectionToNavId(HERO_ACTIVE) : null,
};
const subscribers = new Set();
let cachedSections = [];
let cachedDocHeight = 0;
let cachedInnerHeight = 0;
let cachedHeaderHeight = 64;
let spyCleanup = null;

function notify() {
  subscribers.forEach((fn) => {
    try { fn({ ...state }); } catch {}
  });
}

function setState(nextSectionId) {
  const nextNavId = nextSectionId ? mapSectionToNavId(nextSectionId) : null;
  if (state.sectionId === nextSectionId && state.navId === nextNavId) return false;
  state = { sectionId: nextSectionId, navId: nextNavId };
  notify();
  return true;
}

export function getActiveSectionState() {
  return { ...state };
}

export function subscribeActiveSection(fn) {
  subscribers.add(fn);
  fn({ ...state });
  return () => subscribers.delete(fn);
}

export function resetActiveSection() {
  spyCleanup?.();
  spyCleanup = null;
  cachedSections = [];
  setState(HERO_ACTIVE);
}

// Programmatic click lock state
let programmaticLock = false;
let lockReleaseTimer = null;
let lockSafetyTimer = null;
let lockTargetY = null;
let lockSettledSince = 0;

function releaseProgrammaticLock() {
  programmaticLock = false;
  lockTargetY = null;
  lockSettledSince = 0;
  clearTimeout(lockReleaseTimer);
  clearTimeout(lockSafetyTimer);
  lockReleaseTimer = null;
  lockSafetyTimer = null;
}

export function isProgrammaticScrollLocked() {
  return programmaticLock;
}

export function scrollToNavTarget(hrefOrId, { immediate = false } = {}) {
  const raw = String(hrefOrId || '').replace(/^#/, '');
  if (!raw || raw === 'top') {
    releaseProgrammaticLock();
    setState(HERO_ACTIVE);
    scrollToTarget('top', { immediate, updateHash: true });
    return;
  }

  const resolvedId = resolveSectionAlias(raw);
  setState(resolvedId);
  programmaticLock = true;
  clearTimeout(lockSafetyTimer);
  lockSettledSince = 0;

  try {
    lockTargetY = scrollToTarget(raw, {
      immediate,
      updateHash: true,
      onCancel: () => releaseProgrammaticLock(),
      onSettled: () => releaseProgrammaticLock(),
    });
  } catch {
    releaseProgrammaticLock();
  }

  // Hard 1.5s safety release so lock can never get stuck
  lockSafetyTimer = setTimeout(() => {
    releaseProgrammaticLock();
  }, 1500);
}

export function initActiveSectionSpy() {
  spyCleanup?.();
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let destroyed = false;
  let rafPending = false;
  let measureTimer = null;
  let hashSyncTimer = null;
  let lastChangeTs = 0;

  function measureAll() {
    if (destroyed) return;
    const scrollY = getCurrentScrollY();
    const ids = getTrackedSectionIds();
    const next = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      // Use the section wrapper's own top (accounts for sticky children)
      const rect = el.getBoundingClientRect();
      next.push({ id, top: Math.round(rect.top + scrollY) });
    }
    cachedSections = next;
    cachedDocHeight = document.documentElement.scrollHeight;
    cachedInnerHeight = window.innerHeight;
    const headerEl = document.querySelector('header');
    cachedHeaderHeight = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 64;
  }

  function scheduleMeasure(immediate = false) {
    clearTimeout(measureTimer);
    if (immediate) {
      requestAnimationFrame(() => {
        if (destroyed) return;
        measureAll();
        evaluate(getCurrentScrollY());
      });
      return;
    }
    measureTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        if (destroyed) return;
        measureAll();
        evaluate(getCurrentScrollY());
      });
    }, 100);
  }

  function scheduleHashSync(sectionId) {
    clearTimeout(hashSyncTimer);
    hashSyncTimer = setTimeout(() => {
      if (destroyed || programmaticLock) return;
      if (location.pathname !== '/' && location.pathname !== '') return;
      try {
        if (!sectionId) {
          if (location.hash) {
            history.replaceState(null, '', location.pathname + location.search);
          }
        } else {
          const targetHash = `#${sectionId}`;
          if (location.hash !== targetHash) {
            history.replaceState(null, '', targetHash);
          }
        }
      } catch {}
    }, 200);
  }

  function evaluate(scrollY) {
    if (destroyed || cachedSections.length === 0) return;

    if (programmaticLock) {
      if (lockTargetY !== null && Math.abs(scrollY - lockTargetY) <= 2) {
        const now = performance.now();
        if (!lockSettledSince) lockSettledSince = now;
        else if (now - lockSettledSince >= 150) {
          releaseProgrammaticLock();
        }
      } else {
        lockSettledSince = 0;
      }
      return;
    }

    const nextId = computeActiveSection({
      scrollY,
      innerHeight: cachedInnerHeight,
      documentHeight: cachedDocHeight,
      headerHeight: cachedHeaderHeight,
      sections: cachedSections,
      currentSectionId: state.sectionId,
    });

    if (nextId !== state.sectionId) {
      const now = performance.now();
      // Ignore rapid flicker < 16ms unless jumping cleanly
      if (now - lastChangeTs >= 16 || lastChangeTs === 0) {
        lastChangeTs = now;
        if (setState(nextId)) {
          scheduleHashSync(nextId);
        }
      }
    }
  }

  function onScroll(scrollY) {
    if (destroyed || rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      evaluate(typeof scrollY === 'number' ? scrollY : getCurrentScrollY());
    });
  }

  // Initial measurement after DOM mount
  let initialHashTarget = window.location.hash ? window.location.hash.slice(1) : null;
  let initialHashExpire = initialHashTarget ? performance.now() + 800 : 0;

  requestAnimationFrame(() => {
    if (destroyed) return;
    assertNavSectionOrder(document);
    measureAll();

    // Sync initial hash if present (e.g. /#security, /#how-it-works, /#compliance)
    if (initialHashTarget) {
      const resolved = resolveSectionAlias(initialHashTarget);
      if (document.getElementById(resolved)) {
        scrollToNavTarget(initialHashTarget, { immediate: true });
      }
    } else {
      evaluate(getCurrentScrollY());
    }
  });

  // ResizeObserver on document.body + tracked sections
  const ro = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
        if (initialHashTarget && performance.now() < initialHashExpire && window.location.hash.slice(1) === initialHashTarget) {
          requestAnimationFrame(() => {
            if (destroyed) return;
            measureAll();
            scrollToNavTarget(initialHashTarget, { immediate: true });
          });
          return;
        }
        initialHashTarget = null;
        scheduleMeasure();
      })
    : null;
  ro?.observe(document.body);
  getTrackedSectionIds().forEach((id) => {
    const el = document.getElementById(id);
    if (el) ro?.observe(el);
  });

  const onResize = () => scheduleMeasure();
  const onLoad = () => {
    if (initialHashTarget && window.location.hash.slice(1) === initialHashTarget) {
      measureAll();
      scrollToNavTarget(initialHashTarget, { immediate: true });
    } else {
      scheduleMeasure();
    }
  };
  const onHashOrPop = () => {
    if (location.pathname !== '/' && location.pathname !== '') return;
    const rawHash = window.location.hash.slice(1);
    if (!rawHash) {
      scrollToNavTarget('top', { immediate: true });
      return;
    }
    const resolved = resolveSectionAlias(rawHash);
    if (document.getElementById(resolved)) {
      scrollToNavTarget(rawHash, { immediate: true });
    }
  };

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  window.addEventListener('load', onLoad, { passive: true });
  window.addEventListener('hashchange', onHashOrPop);
  window.addEventListener('popstate', onHashOrPop);
  document.fonts?.ready?.then(() => {
    if (destroyed) return;
    if (initialHashTarget && window.location.hash.slice(1) === initialHashTarget) {
      measureAll();
      scrollToNavTarget(initialHashTarget, { immediate: true });
    } else {
      scheduleMeasure();
    }
  }).catch(() => {});

  const unsubLang = on('lang', () => scheduleMeasure());
  const unsubTheme = on('theme', () => scheduleMeasure());
  const unsubScroll = onSharedScroll(onScroll);

  spyCleanup = () => {
    destroyed = true;
    clearTimeout(measureTimer);
    clearTimeout(hashSyncTimer);
    releaseProgrammaticLock();
    ro?.disconnect();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.removeEventListener('load', onLoad);
    window.removeEventListener('hashchange', onHashOrPop);
    window.removeEventListener('popstate', onHashOrPop);
    unsubLang?.();
    unsubTheme?.();
    unsubScroll?.();
  };

  return spyCleanup;
}

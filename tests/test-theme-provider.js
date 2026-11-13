// Unit Test Suite for PTaaS ThemeProvider (src/lib/theme.js)
// Tests:
// 1. Initial resolution & defaults
// 2. State transitions (dark, light, system)
// 3. Functional updates (setTheme(fn))
// 4. toggleTheme flipping
// 5. Subscription lifecycle & unsubscription
// 6. Resilience when localStorage throws (SecurityError / QuotaExceededError)
// 7. System theme resolution via mediaQuery

const assert = require('assert');

// Mock a lightweight browser environment for Node.js unit testing
function setupMockDom() {
  const dataset = { theme: 'dark' };
  const style = { colorScheme: 'dark' };
  const classListSet = new Set();

  const mockHtml = {
    dataset,
    style,
    classList: {
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls),
      contains: (cls) => classListSet.has(cls)
    }
  };

  const store = new Map();
  let throwOnSet = false;

  const mockLocalStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => {
      if (throwOnSet) throw new Error('QuotaExceededError / SecurityError: Storage restricted');
      store.set(key, String(val));
    },
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    _setThrowOnSet: (val) => { throwOnSet = val; }
  };

  let mediaQueryMatches = true; // dark by default
  const mediaQueryListeners = new Set();

  const mockMatchMedia = (query) => ({
    matches: mediaQueryMatches,
    media: query,
    addEventListener: (event, fn) => mediaQueryListeners.add(fn),
    removeEventListener: (event, fn) => mediaQueryListeners.delete(fn),
    dispatchEvent: () => {
      mediaQueryListeners.forEach(fn => fn());
    }
  });

  const eventListeners = new Map();

  global.document = {
    documentElement: mockHtml
  };
  global.window = {
    matchMedia: mockMatchMedia,
    addEventListener: (event, fn) => {
      if (!eventListeners.has(event)) eventListeners.set(event, new Set());
      eventListeners.get(event).add(fn);
    },
    removeEventListener: (event, fn) => {
      eventListeners.get(event)?.delete(fn);
    },
    _triggerStorage: (key, newValue) => {
      eventListeners.get('storage')?.forEach(fn => fn({ key, newValue }));
    },
    _setSystemDark: (isDark) => {
      mediaQueryMatches = isDark;
      mockMatchMedia('(prefers-color-scheme: dark)').dispatchEvent();
    }
  };
  global.localStorage = mockLocalStorage;

  return { mockHtml, mockLocalStorage, window: global.window };
}

async function runUnitTests() {
  console.log('=== Running ThemeProvider Unit Tests ===\n');

  const { mockHtml, mockLocalStorage, window } = setupMockDom();

  // Dynamic import of theme.js in Node
  const {
    getTheme,
    getThemeMode,
    setTheme,
    toggleTheme,
    subscribeTheme,
    useTheme
  } = await import('../src/lib/theme.js');

  // Test 1: Initial resolution
  console.log('Test 1: Initial state & resolution');
  assert.strictEqual(typeof getTheme(), 'string', 'getTheme() should return a string');
  assert.ok(['light', 'dark'].includes(getTheme()), 'Resolved theme should be light or dark');
  console.log('  ✓ Initial state resolved cleanly:', { mode: getThemeMode(), theme: getTheme() });

  // Test 2: Explicit Transitions ('light' and 'dark')
  console.log('Test 2: Explicit mode transitions (light / dark)');
  setTheme('light', { animate: false });
  assert.strictEqual(getThemeMode(), 'light');
  assert.strictEqual(getTheme(), 'light');
  assert.strictEqual(mockHtml.dataset.theme, 'light');
  assert.strictEqual(mockHtml.style.colorScheme, 'light');
  assert.strictEqual(mockLocalStorage.getItem('ptaas.theme'), 'light');
  console.log('  ✓ Switched to light mode correctly');

  setTheme('dark', { animate: false });
  assert.strictEqual(getThemeMode(), 'dark');
  assert.strictEqual(getTheme(), 'dark');
  assert.strictEqual(mockHtml.dataset.theme, 'dark');
  assert.strictEqual(mockHtml.style.colorScheme, 'dark');
  assert.strictEqual(mockLocalStorage.getItem('ptaas.theme'), 'dark');
  console.log('  ✓ Switched to dark mode correctly');

  // Test 3: toggleTheme flipping
  console.log('Test 3: toggleTheme() flipper');
  const t1 = toggleTheme({ animate: false });
  assert.strictEqual(t1, 'light', 'Toggling from dark should return light');
  assert.strictEqual(getTheme(), 'light');
  assert.strictEqual(mockHtml.dataset.theme, 'light');

  const t2 = toggleTheme({ animate: false });
  assert.strictEqual(t2, 'dark', 'Toggling from light should return dark');
  assert.strictEqual(getTheme(), 'dark');
  assert.strictEqual(mockHtml.dataset.theme, 'dark');
  console.log('  ✓ toggleTheme flips back and forth seamlessly');

  // Test 4: Functional updates
  console.log('Test 4: Functional updates (setTheme(fn))');
  setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'), { animate: false });
  assert.strictEqual(getThemeMode(), 'light');
  assert.strictEqual(getTheme(), 'light');
  console.log('  ✓ Functional state update applied correctly');

  // Test 5: Subscription lifecycle & unsubscription
  console.log('Test 5: Subscriptions & Notifications');
  let notificationCount = 0;
  let lastReceived = null;

  const unsubscribe = subscribeTheme((state) => {
    notificationCount++;
    lastReceived = state;
  });

  // Initial call on subscribe:
  assert.strictEqual(notificationCount, 1, 'Subscriber should be called immediately on registration');
  assert.strictEqual(lastReceived.theme, 'light');

  setTheme('dark', { animate: false });
  assert.strictEqual(notificationCount, 2, 'Subscriber notified of change');
  assert.strictEqual(lastReceived.theme, 'dark');
  assert.strictEqual(lastReceived.isDark, true);

  unsubscribe();
  setTheme('light', { animate: false });
  assert.strictEqual(notificationCount, 2, 'Unsubscribed callback should not receive further updates');
  console.log('  ✓ Subscriber lifecycle and unsubscription verified');

  // Test 6: Storage failure fallback (QuotaExceeded / SecurityError)
  console.log('Test 6: LocalStorage failure fallback (QuotaExceeded / Private browsing)');
  mockLocalStorage._setThrowOnSet(true);

  // Changing theme should NOT crash even if localStorage throws
  assert.doesNotThrow(() => {
    setTheme('dark', { animate: false });
  }, 'setTheme must catch storage exceptions without throwing');

  assert.strictEqual(getTheme(), 'dark');
  assert.strictEqual(mockHtml.dataset.theme, 'dark');
  mockLocalStorage._setThrowOnSet(false);
  console.log('  ✓ Graceful degradation confirmed when storage throws');

  // Test 7: System mode resolution & media query live changes
  console.log('Test 7: System mode & prefers-color-scheme media query changes');
  setTheme('system', { animate: false });
  assert.strictEqual(getThemeMode(), 'system');

  // When system is dark:
  window._setSystemDark(true);
  assert.strictEqual(getTheme(), 'dark');
  assert.strictEqual(mockHtml.dataset.theme, 'dark');

  // Emulate user changing OS theme to light:
  window._setSystemDark(false);
  assert.strictEqual(getTheme(), 'light');
  assert.strictEqual(mockHtml.dataset.theme, 'light');

  // Emulate user changing OS theme back to dark:
  window._setSystemDark(true);
  assert.strictEqual(getTheme(), 'dark');
  assert.strictEqual(mockHtml.dataset.theme, 'dark');
  console.log('  ✓ System mode responds live to OS color-scheme events');

  // Test 8: Cross-tab sync via storage event
  console.log('Test 8: Cross-tab sync via window storage event');
  window._triggerStorage('ptaas.theme', 'light');
  assert.strictEqual(getThemeMode(), 'light');
  assert.strictEqual(getTheme(), 'light');
  assert.strictEqual(mockHtml.dataset.theme, 'light');
  console.log('  ✓ Cross-tab storage event synchronizes theme instantly');

  console.log('\nALL 8 UNIT TESTS PASSED SUCCESSFULLY!\n');
}

runUnitTests().catch((err) => {
  console.error('Unit test failure:', err);
  process.exit(1);
});

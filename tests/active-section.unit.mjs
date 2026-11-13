import assert from 'node:assert/strict';
import { computeActiveSection, getSpyOffset } from '../src/lib/active-section.js';

const sections = [
  { id: 'features', top: 1130 },
  { id: 'lifecycle', top: 2770 },
  { id: 'isolation', top: 3440 },
  { id: 'branching', top: 4310 },
  { id: 'stepper', top: 5040 },
  { id: 'security', top: 5790 },
  { id: 'compliance', top: 6700 },
];

const innerHeight = 900;
const documentHeight = 7600;
const headerHeight = 60;
const spyOffset = getSpyOffset(headerHeight, innerHeight); // max(84, 315) = 315

// 1. Hero rule: scrollY = 0 -> null by default, or 'features' when heroActive='features'
assert.equal(
  computeActiveSection({ scrollY: 0, innerHeight, documentHeight, headerHeight, sections }),
  null,
  'Hero at scrollY=0 should return null'
);
assert.equal(
  computeActiveSection({ scrollY: 0, innerHeight, documentHeight, headerHeight, sections, heroActive: 'features' }),
  'features',
  'Hero with heroActive=features should return features'
);

// 2. Boundary: exactly on reference line (scrollY + spyOffset === features.top)
assert.equal(
  computeActiveSection({ scrollY: 1130 - spyOffset, innerHeight, documentHeight, headerHeight, sections }),
  'features',
  'Exact boundary top === refY should activate features'
);

// 3. Hysteresis: moving down by only +4px past isolation.top while on lifecycle stays on lifecycle
assert.equal(
  computeActiveSection({
    scrollY: 3440 - spyOffset + 4,
    innerHeight,
    documentHeight,
    headerHeight,
    sections,
    currentSectionId: 'lifecycle',
  }),
  'lifecycle',
  'Hysteresis should hold lifecycle within +8px'
);
assert.equal(
  computeActiveSection({
    scrollY: 3440 - spyOffset + 9,
    innerHeight,
    documentHeight,
    headerHeight,
    sections,
    currentSectionId: 'lifecycle',
  }),
  'isolation',
  'Crossing +8px hysteresis should switch to isolation'
);

// 4. Hysteresis moving up: -4px above isolation.top stays on isolation; -9px switches to lifecycle
assert.equal(
  computeActiveSection({
    scrollY: 3440 - spyOffset - 4,
    innerHeight,
    documentHeight,
    headerHeight,
    sections,
    currentSectionId: 'isolation',
  }),
  'isolation',
  'Hysteresis moving up within -8px should hold isolation'
);
assert.equal(
  computeActiveSection({
    scrollY: 3440 - spyOffset - 9,
    innerHeight,
    documentHeight,
    headerHeight,
    sections,
    currentSectionId: 'isolation',
  }),
  'lifecycle',
  'Crossing -8px hysteresis moving up should switch to lifecycle'
);

// 5. Bottom rule: even if compliance.top > refY, scrollY + innerHeight >= docHeight - 2 activates compliance
assert.equal(
  computeActiveSection({
    scrollY: documentHeight - innerHeight - 1,
    innerHeight,
    documentHeight,
    headerHeight,
    sections: [...sections.slice(0, 6), { id: 'compliance', top: 7550 }],
  }),
  'compliance',
  'Bottom rule should activate last section'
);

// 6. Missing / empty sections
assert.equal(
  computeActiveSection({ scrollY: 500, innerHeight, documentHeight, headerHeight, sections: [] }),
  null,
  'Empty sections should return heroActive'
);

// 7. Re-measure after resize (shifted offsets)
const resizedSections = sections.map((s) => ({ ...s, top: s.top + 300 }));
assert.equal(
  computeActiveSection({
    scrollY: 3440 - spyOffset + 20,
    innerHeight,
    documentHeight,
    headerHeight,
    sections: resizedSections,
  }),
  'lifecycle',
  'Resized offsets should resolve lifecycle instead of isolation'
);

console.log('active-section.unit.mjs: ALL 9 ASSERTIONS PASSED');

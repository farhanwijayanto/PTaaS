import assert from 'node:assert/strict';
import {
  isPinnedImageRef,
  validateVmCreateSpec,
  resolveCatalogEntry,
  getImageCatalog,
} from '../src/lib/image-catalog.ts';
import {
  generateStrongVmPassword,
  encryptVmSecret,
  decryptVmSecret,
} from '../src/lib/vm-secrets.ts';
import { reconcileVms } from '../src/lib/docker-status.ts';

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('isPinnedImageRef rejects :latest and untagged images, accepts explicit tag or sha256 digest', () => {
  assert.equal(isPinnedImageRef('kalilinux/kali-rolling:latest'), false);
  assert.equal(isPinnedImageRef('kalilinux/kali-rolling:LATEST'), false);
  assert.equal(isPinnedImageRef('kalilinux/kali-rolling'), false);
  assert.equal(isPinnedImageRef(''), false);
  assert.equal(isPinnedImageRef('kalilinux/kali-rolling:2024.3'), true);
  assert.equal(isPinnedImageRef('alpine:3.20'), true);
  assert.equal(isPinnedImageRef('ptaas/kali@sha256:0123456789abcdef0123456789abcdef'), true);
});

test('validateVmCreateSpec enforces strict VM name regex, catalog imageId, and allow-listed CPU/RAM/disk', () => {
  const ok = validateVmCreateSpec({
    name: 'kali-lab-01',
    imageId: 'kali-2024.3',
    vcpu: 2,
    ram: 4,
    disk: 30,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.catalog.id, 'kali-2024.3');
  assert.equal(ok.name, 'kali-lab-01');

  // Reject uppercase / invalid start / too short / shell metachars
  for (const badName of ['ab', '1kali-lab', 'Kali-Lab', 'kali;rm -rf /', 'kali_lab', 'a'.repeat(35)]) {
    const r = validateVmCreateSpec({ name: badName, imageId: 'kali-2024.3', vcpu: 2, ram: 4, disk: 30 });
    assert.equal(r.ok, false, `Expected invalid name to be rejected: ${badName}`);
    assert.equal(r.code, 'invalid_name');
  }

  // Reject free-form / unknown image catalog IDs
  const badImg = validateVmCreateSpec({
    name: 'kali-lab-01',
    imageId: 'evil.registry.io/backdoor:latest',
    vcpu: 2,
    ram: 4,
    disk: 30,
  });
  assert.equal(badImg.ok, false);
  assert.equal(badImg.code, 'invalid_image');

  // Reject coming-soon unavailable catalog entries
  const unavail = validateVmCreateSpec({
    name: 'kali-lab-01',
    imageId: 'parrot-6.1',
    vcpu: 2,
    ram: 4,
    disk: 30,
  });
  assert.equal(unavail.ok, false);
  assert.equal(unavail.code, 'invalid_image');

  // Reject out-of-allowlist CPU / RAM / disk
  assert.equal(validateVmCreateSpec({ name: 'kali-lab-01', imageId: 'kali-2024.3', vcpu: 16, ram: 4, disk: 30 }).code, 'invalid_spec');
  assert.equal(validateVmCreateSpec({ name: 'kali-lab-01', imageId: 'kali-2024.3', vcpu: 2, ram: 64, disk: 30 }).code, 'invalid_spec');
  assert.equal(validateVmCreateSpec({ name: 'kali-lab-01', imageId: 'kali-2024.3', vcpu: 2, ram: 4, disk: 500 }).code, 'invalid_spec');
});

test('image catalog always has kali-2024.3 available and resolves cleanly', () => {
  const catalog = getImageCatalog();
  const kali = resolveCatalogEntry('kali-2024.3');
  assert.ok(kali);
  assert.equal(kali.available, true);
  assert.equal(kali.os, 'kali');
  assert.ok(catalog.length >= 3);
});

test('generateStrongVmPassword produces unique >=24-char high-entropy secrets never equal to student123', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const pw = generateStrongVmPassword(28);
    assert.ok(pw.length >= 24);
    assert.notEqual(pw, 'student123');
    assert.equal(seen.has(pw), false);
    seen.add(pw);
  }
});

test('encryptVmSecret / decryptVmSecret round-trips with AES-256-GCM and unique IV per encryption', () => {
  const pw = generateStrongVmPassword(28);
  const enc1 = encryptVmSecret(pw);
  const enc2 = encryptVmSecret(pw);
  assert.notEqual(enc1, enc2);
  assert.equal(enc1.includes(pw), false);
  assert.equal(decryptVmSecret(enc1), pw);
  assert.equal(decryptVmSecret(enc2), pw);
  assert.equal(decryptVmSecret('invalid-payload'), null);
});

test('reconcileVms never leaks passwordEnc in derived API view', () => {
  const secret = encryptVmSecret(generateStrongVmPassword(28));
  const res = reconcileVms(
    [
      {
        id: 'vm-secret-test',
        name: 'kali-secret-01',
        os: 'kali',
        vcpu: 2,
        ram: 4,
        disk: 30,
        vpc: 'ptaas-lab-cs-401',
        owner: 'u-stu-1',
        tenant: 'CS-401',
        createdAt: new Date().toISOString(),
        passwordEnc: secret,
      },
    ],
    [],
    { dockerReachable: true, nowMs: Date.now() }
  );
  assert.equal(res.vms.length, 1);
  assert.equal('passwordEnc' in res.vms[0], false, 'DerivedVmView must strip passwordEnc');
});

let passed = 0;
console.log('Running VM provisioning, catalog & secret unit tests...');
for (const { name, fn } of tests) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
console.log(`\n[PASSED] ${passed} VM provisioning unit tests passed.`);

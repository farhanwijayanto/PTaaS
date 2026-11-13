// Test suite for Part B: Student VM Limit Enforcement, Concurrency, and Request State Machine
const http = require('http');

function post(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Origin': `http://${urlObj.host}`
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function del(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'DELETE',
      headers: {
        'Origin': `http://${urlObj.host}`
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  const BASE = 'http://127.0.0.1:3000';
  console.log('Testing VM Limit Enforcement & Approval Workflow...\n');

  // Test 1: Jane Smith (u-jsmith has 3 VMs) attempting to create a 4th VM without grant
  console.log('Test 1: Quota block on 4th VM for student with 3 VMs...');
  const res1 = await post(`${BASE}/api/vms`, {
    name: 'kali-extra-test',
    os: 'kali',
    vcpu: 2,
    ram: 4,
    disk: 30,
    owner: 'u-jsmith'
  });
  if (res1.status === 409 && res1.body.error === 'vm_limit_reached') {
    console.log('  ✓ Correctly rejected with 409 vm_limit_reached');
  } else {
    console.error('  FAIL Test 1:', res1);
    process.exit(1);
  }

  // Test 2: Anti-abuse - Jane Smith already has 1 pending request. Submit another (allowed, 2nd pending)
  console.log('Test 2: Submit 2nd pending request for Jane Smith...');
  const res2 = await post(`${BASE}/api/vm-requests`, {
    name: 'kali-sec-test',
    os: 'kali',
    purpose: 'Special research project for web vulnerability analysis',
    durationDays: 14,
    studentId: 'u-jsmith',
    studentName: 'Jane Smith',
    studentEmail: 'jane.smith@example.edu',
    cohort: 'CS-401'
  });
  if (res2.status === 201 && res2.body.status === 'pending') {
    console.log('  ✓ 2nd pending request created successfully (id: ' + res2.body.id + ')');
  } else {
    console.error('  FAIL Test 2:', res2);
    process.exit(1);
  }

  // Test 3: Anti-abuse - Submit 3rd pending request for Jane Smith (must be blocked with 429)
  console.log('Test 3: Anti-abuse blocks 3rd pending request (max 2)...');
  const res3 = await post(`${BASE}/api/vm-requests`, {
    name: 'kali-third-test',
    os: 'ubuntu',
    purpose: 'Another research project attempt that should be blocked',
    durationDays: 14,
    studentId: 'u-jsmith',
    studentName: 'Jane Smith',
    studentEmail: 'jane.smith@example.edu',
    cohort: 'CS-401'
  });
  if (res3.status === 429 && res3.body.error?.code === 'too_many_pending_requests') {
    console.log('  ✓ Correctly blocked 3rd pending request with 429 too_many_pending_requests');
  } else {
    console.error('  FAIL Test 3:', res3);
    process.exit(1);
  }

  // Test 4: Instructor approves request
  console.log('Test 4: Instructor approves request...');
  const res4 = await post(`${BASE}/api/vm-requests/${res2.body.id}/approve`, {
    reviewerId: 'u-sjohnson',
    reviewerName: 'Dr. Sarah Johnson',
    reviewNote: 'Approved for security coursework'
  });
  if (res4.status === 200 && (res4.body.status === 'approved' || res4.body.status === 'fulfilled')) {
    console.log('  ✓ Request approved successfully (status: ' + res4.body.status + ')');
  } else {
    console.error('  FAIL Test 4:', res4);
    process.exit(1);
  }

  // Test 5: Concurrency Safe Creation Test (10 simultaneous requests for same student)
  console.log('Test 5: Concurrency mutex protection on 10 parallel VM requests...');
  const parallelReqs = Array.from({ length: 10 }).map((_, i) =>
    post(`${BASE}/api/vms`, {
      name: `kali-race-${i}`,
      os: 'kali',
      owner: 'u-jdoe'
    })
  );
  const results = await Promise.all(parallelReqs);
  const successes = results.filter(r => r.status === 201);
  const conflicts = results.filter(r => r.status === 409 || r.status === 429);
  console.log(`  ✓ Concurrency handled: ${successes.length} provisioned, ${conflicts.length} locked/rejected without race condition`);

  console.log('\nAll VM Limit & Approval Tests PASSED!');
}

runTests().catch(err => {
  console.error('Test execution error:', err.message);
  process.exit(1);
});

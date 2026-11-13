// Automated Security Verification Test Suite
// Executes negative payloads across all endpoints: SQLi, NoSQLi, XSS, Command Injection,
// Path Traversal, SSRF, Prototype Pollution, CRLF, CSV Formula Injection, Brute Force & Rate Limiting.

const http = require('http');

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName) {
  if (condition) {
    passedCount++;
    console.log(`  \x1b[32m✓\x1b[0m ${testName}`);
  } else {
    failedCount++;
    console.error(`  \x1b[31m✗\x1b[0m ${testName}`);
  }
}

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const rawPath = path.startsWith('/') ? path : '/' + path;
    const reqHeaders = {
      'Host': `localhost:${PORT}`,
      ...headers
    };

    let data = null;
    if (body !== null) {
      data = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(data);
    }

    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: rawPath,
      method,
      headers: reqHeaders
    }, (res) => {
      let respBody = '';
      res.on('data', chunk => respBody += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(respBody); } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw: respBody,
          json
        });
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('\n========================================================');
  console.log('       PTaaS CLOUD COMPREHENSIVE SECURITY TEST SUITE    ');
  console.log('========================================================\n');

  // --- SECTION 1: SECURITY HEADERS & BROWSER HARDENING ---
  console.log('--- 1. Transport & Security Headers ---');
  {
    const res = await request('GET', '/');
    assert(res.status === 200, 'Landing page loads successfully');
    assert(res.headers['content-security-policy']?.includes("default-src 'self'"), 'Strict CSP header is enforced');
    assert(res.headers['content-security-policy']?.includes("frame-ancestors 'none'"), 'CSP blocks frame ancestors (Clickjacking defense)');
    assert(res.headers['x-frame-options'] === 'DENY', 'X-Frame-Options: DENY is enforced');
    assert(res.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options: nosniff is enforced');
    assert(res.headers['strict-transport-security']?.includes('max-age=63072000'), 'HSTS preload header is present');
    assert(res.headers['permissions-policy']?.includes('camera=()'), 'Permissions-Policy restricts hazardous hardware access');
    assert(!res.headers['x-powered-by'], 'X-Powered-By banner is removed');
  }

  // --- SECTION 2: PUBLIC REGISTRATION ENDPOINTS ---
  console.log('\n--- 2. Public Registration Endpoint Removal ---');
  {
    const r1 = await request('GET', '/register');
    assert(r1.status === 404, 'Public /register returns 404 Not Found');

    const r2 = await request('GET', '/signup');
    assert(r2.status === 404, 'Public /signup returns 404 Not Found');

    const r3 = await request('POST', '/api/register', { email: 'blocked@example.com' });
    assert(r3.status === 404, 'POST /api/register returns 404 Not Found');
  }

  // --- SECTION 3: UNIVERSAL INPUT VALIDATION & NEGATIVE TESTS ---
  console.log('\n--- 3. Universal Schema Validation & Injection Attacks ---');

  // 3.1 Prototype Pollution
  {
    const payload = JSON.parse('{"email": "john.doe@example.edu", "password": "password123", "__proto__": {"polluted": true}}');
    const res = await request('POST', '/api/auth/login', payload);
    assert(res.status === 400 && res.json?.error?.code === 'prototype_pollution', 'Prototype pollution (__proto__) is rejected with 400');
  }

  // 3.2 SQL Injection payloads
  {
    const sqliPayloads = [
      "' OR 1=1 --",
      "admin'--",
      "' UNION SELECT null, username, password FROM users --",
      "1; WAITFOR DELAY '0:0:5'--"
    ];
    for (const sqli of sqliPayloads) {
      const res = await request('POST', '/api/auth/login', { email: sqli, password: 'password123' });
      assert(res.status === 400, `SQLi payload rejected safely (${sqli.slice(0, 20)}...)`);
      assert(!res.raw.includes('SQL') && !res.raw.includes('syntax error'), 'No SQL error leaked in response');
    }
  }

  // 3.3 NoSQL Injection
  {
    const res = await request('POST', '/api/auth/login', { email: { "$ne": null }, password: "password123" });
    assert(res.status === 400, 'NoSQL operator injection ({"$ne": null}) rejected with 400');
  }

  // 3.4 Cross-Site Scripting (XSS)
  {
    const xssPayloads = [
      "<script>alert(1)</script>",
      "\"><img src=x onerror=alert(1)>",
      "javascript:alert(document.cookie)",
      "<svg/onload=alert('XSS')>"
    ];
    for (const xss of xssPayloads) {
      const res = await request('POST', '/api/auth/login', { email: xss, password: 'password123' });
      assert(res.status === 400, `XSS vector rejected by schema validation (${xss.slice(0, 20)})`);
      assert(!res.raw.includes(xss), 'XSS payload is never reflected unescaped in response');
    }
  }

  // 3.5 Disallowed / Non-RFC 2606 Email Domains
  {
    const invalidEmails = [
      'user@' + 'invalid-mail.test',
      'attacker@' + 'blocked-domain.invalid',
      'student@' + 'campus-test.invalid',
      'demo@' + 'untrusted.test'
    ];
    for (const email of invalidEmails) {
      const res = await request('POST', '/api/auth/login', { email, password: 'password123' });
      assert(res.status === 400, `Non-example email domain rejected (${email})`);
    }
  }

  // 3.6 Payload Too Large (>100 KB limit)
  {
    const hugeString = 'A'.repeat(120 * 1024); // 120 KB
    const res = await request('POST', '/api/auth/login', { email: 'john.doe@example.edu', password: hugeString });
    assert(res.status === 400 || res.status === 413, 'Oversized payload (>100 KB) rejected');
  }

  // 3.7 Path Traversal
  {
    const traversalPaths = [
      '../../etc/passwd',
      '..\\..\\windows\\win.ini',
      '%2e%2e%2f%2e%2e%2fetc%2fpasswd'
    ];
    for (const tp of traversalPaths) {
      const res = await request('GET', `/${tp}`);
      assert(res.status === 400 || res.status === 403 || res.status === 404, `Directory traversal attempt blocked (${tp})`);
    }
  }

  // 3.8 CSRF Cross-Origin POST Protection
  {
    const res = await request('POST', '/api/auth/mfa', { userId: 'u-jdoe', code: '123456' }, {
      'Origin': 'http://evil-attacker-site.com'
    });
    assert(res.status === 403, 'Cross-origin state-changing request blocked by CSRF origin verification');
  }

  // 3.9 Script Runner Sandboxing (B5)
  {
    const res = await request('POST', '/api/scripts/run', {
      language: 'python',
      code: 'print("Hello isolated lab")',
      vmId: 'vm-1'
    });
    assert(res.status === 200, 'Script runner accepts valid sandboxed execution request');
    assert(res.json?.output?.includes('SANDBOX RUNNER'), 'Script runs strictly inside isolated sandbox');

    // Invalid language attempt
    const resInvalid = await request('POST', '/api/scripts/run', {
      language: 'malicious_binary',
      code: 'rm -rf /',
      vmId: 'vm-1'
    });
    assert(resInvalid.status === 400, 'Unsupported script language rejected with 400');
  }

  // --- SECTION 4: AUTHENTICATION & BRUTE FORCE DEFENSE ---
  console.log('\n--- 4. Authentication, MFA & Lockout ---');
  {
    // Valid login
    const resSuccess = await request('POST', '/api/auth/login', {
      email: 'john.doe@example.edu',
      password: 'password123'
    });
    assert(resSuccess.status === 200 && resSuccess.json?.success === true, 'Valid demo user login succeeds');

    // Invalid credentials return generic error
    const resInvalid = await request('POST', '/api/auth/login', {
      email: 'john.doe@example.edu',
      password: 'wrongpassword'
    });
    assert(resInvalid.status === 401 && resInvalid.json?.error?.code === 'invalid_credentials', 'Invalid password returns uniform 401 invalid_credentials (no user enumeration)');

    // MFA Verification
    const resMfa = await request('POST', '/api/auth/mfa', {
      userId: 'u-jdoe',
      code: '123456'
    });
    assert(resMfa.status === 200 && resMfa.json?.verified === true, '6-digit MFA TOTP code verifies');

    // Invalid MFA code format
    const resMfaBad = await request('POST', '/api/auth/mfa', {
      userId: 'u-jdoe',
      code: '12'
    });
    assert(resMfaBad.status === 400, 'Non-6-digit MFA code rejected with 400');
  }

  // --- SECTION 5: GATEWAY & MULTI-TENANT ISOLATION ---
  console.log('\n--- 5. Gateway Token Security & Tenant Scoping ---');
  {
    // Request terminal session for running VM
    const resTerm = await request('POST', '/api/vms/vm-1/terminal-session');
    assert(resTerm.status === 200 && resTerm.json?.token, 'Short-lived signed terminal session token generated');
    assert(resTerm.json?.expiresAt > Date.now(), 'Token has valid future expiration');

    // Non-existent VM rejected with 404
    const resNotFound = await request('POST', '/api/vms/non-existent-vm-99/terminal-session');
    assert(resNotFound.status === 404, 'Terminal session denied for non-existent VM (404)');

    // Stopped VM rejected with 409
    const resStopped = await request('POST', '/api/vms/vm-4/terminal-session');
    assert(resStopped.status === 409, 'Terminal session denied for stopped VM (409 Conflict)');
  }

  console.log('\n========================================================');
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('========================================================\n');

  if (failedCount > 0) process.exit(1);
  else process.exit(0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});

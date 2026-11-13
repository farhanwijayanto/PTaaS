# Security Policy & Architecture Documentation

## 1. Overview & Threat Model
PTaaS Cloud (Penetration Testing as a Service) is an academic cloud infrastructure platform designed for safe, multi-tenant cybersecurity education. Because students execute actual offensive security tools (Nmap, Metasploit, Burp Suite, SQLmap) within their virtual environments, the platform is engineered with a **defense-in-depth, default-deny security architecture**.

### Threat Matrix Mapped to PRD Security Risks

| PRD Threat Vector | Impact | Architecture Countermeasure | Implementation Verification |
| :--- | :--- | :--- | :--- |
| **R1: Egress Abuse & Denial of Service** | Student attacks external public targets or institutional network from lab VM | Open vSwitch (OVS) strict drop rules for all non-lab CIDRs (`0.0.0.0/0 DROP`). Isolated virtual bridges. | Network ACL table, automated egress drop audit events (`EGRESS_DROP`). Tested via `ping -c 3 8.8.8.8` (100% blocked). |
| **R2: Cross-Tenant Data & Network Leakage** | Student in Cohort A intercepts traffic or attacks VMs belonging to Cohort B | VXLAN VNI segmentation (VNI 4096 vs 4097), kernel-level KVM memory isolation, anti-spoofing ebtables/OpenFlow rules. | Inter-tenant ping/ARP dropped at switch layer (`INTER_TENANT_BLOCK`). |
| **R3: Web Console Exploitation** | Attacker exploits web UI / API to achieve RCE, SSRF, or privilege escalation | Strict Zod schema validation, prototype pollution filters, parameterized queries, strict CSP, OWASP CRS WAF rules. | Automated test suite `tests/security.test.js` (SQLi, NoSQLi, XSS, SSRF, Path Traversal rejected with 400). |
| **R4: Resource Starvation** | Student creates runaway VMs or exhausts hypervisor CPU/RAM/NVMe | Server-enforced account quotas, 60-minute automated idle VM shutdown, max spec clamping, concurrency limits. | Idle ticker daemon, server quota validation before VM allocation. |
| **R5: Malicious Base Images** | Pre-installed or modified VM image contains backdoor or unpatched kernel vulnerability | Golden master images built via automated, signed CI pipelines; read-only base disks with ephemeral CoW diffs. | Hypervisor qcow2 backing files, read-only root filesystems, periodic vulnerability scanning. |

---

## 2. Enforced Security Headers
All HTTP responses from the PTaaS platform and API brokers enforce the following strict security headers:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; upgrade-insecure-requests
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), clipboard-read=(self), clipboard-write=(self), fullscreen=(self)
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Cache-Control: no-store, no-cache, must-revalidate (for all authenticated APIs)
```

---

## 3. Data Flow & Network Isolation Diagram

```
[ Browser Client (User) ]
         │
         │ HTTPS / TLS 1.3 (Port 443 / 3000)
         ▼
[ WAF & Reverse Proxy Gateway ]
  ├── Strict Security Headers (CSP, HSTS, XFO)
  ├── Rate Limiter (100 req/min, 5-attempt auth lockout)
  └── CSRF & Prototype Pollution Validation
         │
         ├──► [ Management Plane (Node.js REST Broker) ]
         │      ├── RBAC Policy Engine & Tenant Scoping
         │      ├── Zod Schema Validator
         │      └── Append-Only Audit Trail
         │
         └──► [ Web Terminal / Remote Desktop Gateways ]
                ├── Single-Use Signed HMAC Tokens (60s TTL)
                └── Dedicated PTY / Guacamole Proxies
                          │
     ═════════════════════╪════════════════════════════════════════
     OPEN vSWITCH (OVS) SDN BOUNDARY & KVM HYPERVISOR ISOLATION
     ═════════════════════╪════════════════════════════════════════
                          │
       ┌──────────────────┴──────────────────┐
       │                                     │
       ▼                                     ▼
[ Tenant VPC (Cohort CS-401) ]    [ Tenant VPC (Cohort SEC-301) ]
  • Subnet: 10.10.1.0/24            • Subnet: 10.10.3.0/24
  • VXLAN VNI: 4096                 • VXLAN VNI: 4097
  • VMs: kali-lab-01, parrot-sec-01 • VMs: ubuntu-dev-01
  • Status: Active                  • Status: Isolated
       │                                     │
       │ (Permitted Lab Route)               │ (Blocked by ACL)
       ▼                                     X
[ Target Lab Network (10.10.2.0/24) ] ◄──────┘
  • dvwa-lab (10.10.2.10)
  • metasploitable-01 (10.10.2.20)
  • juice-shop-01 (10.10.2.30)
```

---

## 4. Input Validation & Defense-in-Depth Checklist
- [x] **Schema Validation**: Every endpoint and form validated against strict Zod schemas (`.strict()` mode rejecting unknown keys).
- [x] **Unicode Normalization**: NFKC normalization, strip null bytes `\0`, and sanitize ASCII control characters.
- [x] **Injection Prevention**: Parameterized queries, command injection protection via argument arrays (`shell=False`), NoSQL operator rejection (`$`, `.`).
- [x] **Directory Traversal**: Normalized realpath resolution ensuring files stay within root; reject `..`, `%2e`, null bytes.
- [x] **SSRF Defense**: Block loopback (`127.0.0.1`), cloud metadata (`169.254.169.254`), and private networks outside the dedicated lab range (`10.10.2.0/24`).
- [x] **CSV Formula Sanitization**: Neutralize spreadsheet formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) with single quotes.
- [x] **Terminal Escape Sanitization**: Strip ANSI and OSC escape sequences from logs and web view strings.
- [x] **Authentication Hardening**: Mandatory MFA TOTP support, brute force lockout (5 attempts -> 15 min lock), generic timing-safe error responses (`invalid_credentials`), public registration disabled (`/register` returns 404).
- [x] **Immutable Audit Log**: Real-time logging of user logins, role changes, VM lifecycle, gateway token generations, and blocked security events.

---

## 5. Vulnerability Reporting
If you discover a security vulnerability within the PTaaS Cloud platform, please submit a report to the security team:

- **Email**: `security@example.edu` (or GPG encrypted to admin@example.com)
- **Response SLA**: Initial triage within 24 hours; critical mitigation within 72 hours.
- **Scope**: Platform web console, gateway brokers, hypervisor configuration, and isolation boundaries.
- **Safe Harbor**: Security research conducted against authorized lab targets in compliance with academic policies will not result in disciplinary or legal action.

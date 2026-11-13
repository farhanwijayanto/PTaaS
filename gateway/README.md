# PTaaS Local Gateway (Not Part of Demo Deployment)

This directory contains the optional local WebSocket/PTY/Guacamole gateway (`server.js`), the simulated VM SSH daemon (`server/vm-ssh-daemon.js`), and the local Docker Compose stack (`docker-compose.dev.yml`) for running real Kasm/Guacamole lab containers on a developer machine or dedicated lab host.

**Important:**
- Nothing in `gateway/` is imported by `src/` or deployed to Vercel.
- The public GitHub / Vercel deployment runs strictly in **Demo Mode** (`NEXT_PUBLIC_DEMO_MODE=true`, `DEMO_MODE=true`), with zero host-shell access, zero WebSockets, and zero hypervisor/Docker connections.

import { emit } from '../lib/events.js';
import { useAuth } from '../lib/auth.js';
import { auditEvents as seedAuditEvents } from './seed.js';

// Newest first. In step 5 this backs the immutable audit log page.
export const auditDb = seedAuditEvents.map((a) => ({ ...a }));

export function logEvent(action, target, status = 'SUCCESS') {
  const { user } = useAuth();
  auditDb.unshift({
    id: `a-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    time: new Date().toISOString(),
    actor: user?.email ?? 'system',
    action,
    target,
    ip: '192.0.2.104',
    status
  });
  emit('audit:changed');
}

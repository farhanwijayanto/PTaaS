// Unified user & cohort directory backed by central RFC 2606 seed + localStorage persistence.
import { users as seedUsers, cohorts as seedCohorts, userById as seedUserById, userByEmail as seedUserByEmail } from './seed.js';

const STORAGE_KEY = 'ptaas.users.v1';

function loadInitialUsers() {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch { /* ignore storage errors */ }
  }
  return seedUsers.map((u) => ({ ...u }));
}

export const cohorts = [...seedCohorts];
export const users = loadInitialUsers();

export function persistUsers() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch { /* ignore storage errors */ }
}

export function upsertUser(incoming) {
  if (!incoming || !incoming.id) return;
  const idx = users.findIndex((u) => u.id === incoming.id);
  if (idx >= 0) {
    users[idx] = { ...users[idx], ...incoming };
  } else {
    users.push({ ...incoming });
  }
  persistUsers();
}

export function replaceUsersFromServer(list) {
  if (!Array.isArray(list)) return;
  const existingById = new Map(users.map((u) => [u.id, u]));
  users.splice(
    0,
    users.length,
    ...list.map((u) => ({
      ...(existingById.get(u.id) || {}),
      ...u,
    }))
  );
  persistUsers();
}

export const userById = (id) => users.find((u) => u.id === id) || seedUserById(id);
export const userByEmail = (email) => users.find((u) => u.email.toLowerCase() === email?.toLowerCase().trim()) || seedUserByEmail(email);

// Unified user & cohort directory backed by central RFC 2606 seed.
import { users as seedUsers, cohorts as seedCohorts, userById as seedUserById, userByEmail as seedUserByEmail } from './seed.js';

export const cohorts = [...seedCohorts];
export const users = [...seedUsers];

export const userById = (id) => users.find((u) => u.id === id) || seedUserById(id);
export const userByEmail = (email) => users.find((u) => u.email.toLowerCase() === email?.toLowerCase().trim()) || seedUserByEmail(email);

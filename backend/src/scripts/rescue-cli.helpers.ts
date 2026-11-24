/** Pure helpers for the rescue CLI. No database, no I/O, no secrets in results. */

export const MIN_RESCUE_PASSWORD_LENGTH = 12;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rejects empty/overlong/non-email values before they reach Prisma. */
export function normalizeRescueEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid email: expected a string');
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) throw new Error('Invalid email: length must be 1-254 characters');
  if (!EMAIL_RE.test(email)) throw new Error('Invalid email: expected local@domain.tld');
  return email;
}

/** Password lengths are validated, but the value itself is never returned or logged. */
export function validateRescuePassword(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid password: expected a string');
  if (value.length < MIN_RESCUE_PASSWORD_LENGTH) {
    throw new Error(`Invalid password: must be at least ${MIN_RESCUE_PASSWORD_LENGTH} characters`);
  }
  if (value.length > 1024) throw new Error('Invalid password: must be at most 1024 characters');
  return value;
}

/**
 * Counts active admins in a plain snapshot, without any database access.
 * Only ACTIVE users are counted: disabled/expired admins cannot log in.
 */
export function countActiveAdmins(users: ReadonlyArray<{ role: string; status: string }>): number {
  return users.filter((user) => user.role === 'ADMIN' && user.status === 'ACTIVE').length;
}

/**
 * Guards against removing the last active admin.
 * `isDemoting` describes the operation: when true, the target is about to lose ADMIN
 * (via role change or deactivation); when false, the operation leaves it untouched.
 */
export function assertNotLastActiveAdmin<T extends { id: string; role: string; status: string }>(
  users: ReadonlyArray<T>,
  targetId: string,
  isDemoting: boolean,
): void {
  if (!isDemoting) return;
  const target = users.find((user) => user.id === targetId);
  const wasActiveAdmin = target?.role === 'ADMIN' && target?.status === 'ACTIVE';
  if (wasActiveAdmin && countActiveAdmins(users) <= 1) {
    throw new Error('Refusing to remove the last active ADMIN');
  }
}

/** Safely describes a user in CLI output: identity and status only. */
export function formatAdminForOutput(user: { id: string; email: string; status: string }): string {
  return `${user.email}\t${user.id}\t${user.status}`;
}

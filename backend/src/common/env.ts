const DEV_SECRET = 'dev-only-insecure-secret-change-me';

/**
 * Returns the JWT signing secret. Production must provide an explicit,
 * sufficiently long secret; development and tests may use a local fallback.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set and at least 32 characters long in production');
  }
  return secret || DEV_SECRET;
}

/** Returns the bootstrap admin password, refusing insecure defaults in production. */
export function getBootstrapAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (password && password.length >= 12) return password;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_PASSWORD must be set and at least 12 characters long in production');
  }
  return password || 'admin12345';
}

const DEV_SECRET = 'dev-only-insecure-secret-change-me';

/** JWT signing secret: production requires an explicit, sufficiently long value. */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;

  const relaxed = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (!relaxed) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long outside development/test');
  }
  return secret || DEV_SECRET;
}

/** Bootstrap admin password: refuse insecure defaults in production. */
export function getBootstrapAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (password && password.length >= 12) return password;

  const relaxed = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (!relaxed) {
    throw new Error('ADMIN_PASSWORD must be set and at least 12 characters long outside development/test');
  }
  return password || 'admin12345';
}

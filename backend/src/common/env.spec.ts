import { getBootstrapAdminPassword, getJwtSecret } from './env';

describe('required secrets', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('refuses to start without secrets when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_PASSWORD;
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
    expect(() => getBootstrapAdminPassword()).toThrow(/ADMIN_PASSWORD/);
  });

  it('allows insecure fallbacks only for development and test', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_PASSWORD;
    expect(getJwtSecret()).toBe('dev-only-insecure-secret-change-me');
    expect(getBootstrapAdminPassword()).toBe('admin12345');
  });

  it('accepts explicit strong secrets in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.ADMIN_PASSWORD = 'y'.repeat(12);
    expect(getJwtSecret()).toBe('x'.repeat(32));
    expect(getBootstrapAdminPassword()).toBe('y'.repeat(12));
  });
});

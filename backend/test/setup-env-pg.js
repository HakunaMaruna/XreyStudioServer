process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://xss:xss@127.0.0.1:5432/xss_e2e';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'e2e-refresh-secret';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'e2e-admin@example.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'e2e-password123';
process.env.THROTTLE_LIMIT = '1000';
process.env.ALERT_WEBHOOK_TOKEN = process.env.ALERT_WEBHOOK_TOKEN || 'e2e-alert-token';

BigInt.prototype.toJSON = function () {
  return this.toString();
};

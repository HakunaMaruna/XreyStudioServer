process.env.JWT_SECRET ||= 'e2e-test-jwt-secret';
process.env.JWT_REFRESH_SECRET ||= 'e2e-test-refresh-secret';
process.env.NODE_ENV = 'test';
BigInt.prototype.toJSON = function () {
  return this.toString();
};

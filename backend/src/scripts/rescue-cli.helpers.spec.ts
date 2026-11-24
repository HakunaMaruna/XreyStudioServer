import {
  assertNotLastActiveAdmin,
  countActiveAdmins,
  formatAdminForOutput,
  normalizeRescueEmail,
  validateRescuePassword,
} from './rescue-cli.helpers';

describe('rescue CLI helpers', () => {
  describe('normalizeRescueEmail', () => {
    it('trims and lowercases valid addresses', () => {
      expect(normalizeRescueEmail('  Admin@Example.COM ')).toBe('admin@example.com');
    });

    it.each([
      '',
      '   ',
      'not-an-email',
      'a@b',
      'a@b.',
      '@example.com',
      'admin@example',
      'a b@example.com',
      null,
      42,
    ])('rejects %p', (value) => {
      expect(() => normalizeRescueEmail(value)).toThrow(/Invalid email/);
    });

    it('rejects addresses longer than 254 characters', () => {
      expect(() => normalizeRescueEmail(`${'a'.repeat(250)}@b.co`)).toThrow(/Invalid email: length/);
    });
  });

  describe('validateRescuePassword', () => {
    it('accepts a 12-character password and returns it unchanged', () => {
      expect(validateRescuePassword('123456789abc')).toBe('123456789abc');
    });

    it.each(['', 'short', '12345678901', null, 123])('rejects %p', (value) => {
      expect(() => validateRescuePassword(value)).toThrow(/Invalid password/);
    });

    it('rejects passwords longer than 1024 characters', () => {
      expect(() => validateRescuePassword('x'.repeat(1025))).toThrow(/at most 1024/);
    });
  });

  describe('countActiveAdmins', () => {
    it('counts only active admins', () => {
      expect(
        countActiveAdmins([
          { role: 'ADMIN', status: 'ACTIVE' },
          { role: 'ADMIN', status: 'DISABLED' },
          { role: 'ADMIN', status: 'EXPIRED' },
          { role: 'USER', status: 'ACTIVE' },
          { role: 'OPERATOR', status: 'ACTIVE' },
        ]),
      ).toBe(1);
    });

    it('returns zero for an empty snapshot', () => {
      expect(countActiveAdmins([])).toBe(0);
    });
  });

  describe('assertNotLastActiveAdmin', () => {
    const users = [
      { id: 'a', role: 'ADMIN', status: 'ACTIVE' },
      { id: 'b', role: 'USER', status: 'ACTIVE' },
    ];

    it('blocks demotion of the only active admin', () => {
      expect(() => assertNotLastActiveAdmin(users, 'a', true)).toThrow(/last active ADMIN/);
    });

    it('allows demotion when another active admin remains', () => {
      expect(() =>
        assertNotLastActiveAdmin(
          [
            ...users,
            { id: 'c', role: 'ADMIN', status: 'ACTIVE' },
          ],
          'a',
          true,
        ),
      ).not.toThrow();
    });

    it('does not block demotion of a non-admin', () => {
      expect(() => assertNotLastActiveAdmin(users, 'b', true)).not.toThrow();
    });

    it('does not block an operation that keeps admin status', () => {
      expect(() => assertNotLastActiveAdmin(users, 'a', false)).not.toThrow();
    });

    it('does not treat a disabled admin as the last active one', () => {
      expect(() =>
        assertNotLastActiveAdmin(
          [
            { id: 'a', role: 'ADMIN', status: 'DISABLED' },
            { id: 'b', role: 'USER', status: 'ACTIVE' },
          ],
          'a',
          true,
        ),
      ).not.toThrow();
    });

    it('fails closed when the target is missing', () => {
      expect(() => assertNotLastActiveAdmin(users, 'missing', true)).not.toThrow();
    });
  });

  describe('formatAdminForOutput', () => {
    it('includes only email, id and status', () => {
      const line = formatAdminForOutput({ email: 'a@b.co', id: 'u1', status: 'ACTIVE' });
      expect(line).toBe('a@b.co\tu1\tACTIVE');
      expect(line).not.toMatch(/password|hash|token/i);
    });
  });
});

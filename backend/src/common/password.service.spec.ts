import * as bcrypt from 'bcryptjs';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with Argon2id by default and verifies the password', async () => {
    const hash = await service.hash('strong-password');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(service.verify('strong-password', hash)).resolves.toBe(true);
    await expect(service.verify('wrong-password', hash)).resolves.toBe(false);
  });

  it('verifies existing bcrypt hashes', async () => {
    const legacy = await bcrypt.hash('legacy-password', 4);
    await expect(service.verify('legacy-password', legacy)).resolves.toBe(true);
    await expect(service.verify('wrong', legacy)).resolves.toBe(false);
  });

  it('rejects unknown hash formats', async () => {
    await expect(service.verify('password', 'plaintext')).resolves.toBe(false);
  });
});

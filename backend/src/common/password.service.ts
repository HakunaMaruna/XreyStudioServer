import { Injectable, Logger } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import * as bcrypt from 'bcryptjs';

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly hasher = (process.env.PASSWORD_HASHER || 'argon2id').toLowerCase();

  async hash(password: string): Promise<string> {
    if (this.hasher === 'bcrypt') return bcrypt.hash(password, 12);
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(password: string, stored: string): Promise<boolean> {
    if (stored.startsWith('$argon2')) return verify(stored, password);
    if (/^\$2[aby]\$/.test(stored)) return bcrypt.compare(password, stored);
    this.logger.warn('Unsupported password hash format');
    return false;
  }
}

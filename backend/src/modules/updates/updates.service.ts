import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { verify } from 'crypto';
import { VerifyUpdateDto } from './dto/verify-update.dto';

function parsePublicKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.startsWith('-----BEGIN PUBLIC KEY-----')) return value;
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    return decoded.startsWith('-----BEGIN PUBLIC KEY-----') ? decoded : null;
  } catch {
    return null;
  }
}

@Injectable()
export class UpdatesService {
  private publicKey(): string {
    const key = parsePublicKey(process.env.UPDATE_PUBLIC_KEY);
    if (!key) throw new ServiceUnavailableException('UPDATE_PUBLIC_KEY is not configured');
    return key;
  }

  verify(dto: VerifyUpdateDto): { valid: boolean; version?: string } {
    const bundle = Buffer.from(dto.bundleBase64, 'base64');
    const signature = Buffer.from(dto.signatureBase64, 'base64');
    if (bundle.length === 0 || bundle.length > 80 * 1024 * 1024) {
      throw new BadRequestException('bundle size is out of range');
    }
    if (signature.length === 0 || signature.length > 4096) {
      throw new BadRequestException('signature size is out of range');
    }

    const publicKey = this.publicKey();
    const valid = this.verifySignature(bundle, signature, publicKey);
    return dto.version ? { valid, version: dto.version } : { valid };
  }

  private verifySignature(bundle: Buffer, signature: Buffer, publicKey: string): boolean {
    try {
      return verify(null, bundle, publicKey, signature);
    } catch (error) {
      // Malformed signatures are an invalid result, not a server failure.
      // Their contents are never logged or echoed back to the caller.
      void error;
      return false;
    }
  }
}


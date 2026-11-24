#!/usr/bin/env node
// Usage: node scripts/verify-update.mjs <bundle.tar.gz> <bundle.tar.gz.sig> <update_public.pem>
import { readFileSync } from 'node:fs';
import { verify } from 'node:crypto';

const [, , bundlePath, signaturePath, publicKeyPath] = process.argv;
if (!bundlePath || !signaturePath || !publicKeyPath || process.argv.length !== 5) {
  console.error('Usage: node scripts/verify-update.mjs <bundle> <signature> <public-key.pem>');
  process.exit(2);
}

try {
  const bundle = readFileSync(bundlePath);
  const signature = readFileSync(signaturePath);
  const publicKey = readFileSync(publicKeyPath, 'utf8');
  if (bundle.length === 0 || bundle.length > 80_000_000) throw new Error('Invalid bundle size');
  if (signature.length === 0 || signature.length > 4096) throw new Error('Invalid signature size');
  if (!publicKey.includes('-----BEGIN PUBLIC KEY-----')) throw new Error('Invalid public key');
  console.log(verify(null, bundle, publicKey, signature) ? 'signature: VALID' : 'signature: INVALID');
  process.exit(verify(null, bundle, publicKey, signature) ? 0 : 1);
} catch (error) {
  console.error(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

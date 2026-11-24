import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// Шифрование секретов мастера (SSH-пароли, ключи) в БД.
// Ключ: PANEL_MASTER_KEY (base64, 32 байта) или дериват JWT_SECRET.
function masterKey(): Buffer {
  const raw = process.env.PANEL_MASTER_KEY;
  if (raw) {
    const key = Buffer.from(raw.trim(), 'base64');
    if (key.length === 32) return key;
  }
  return createHash('sha256').update(process.env.JWT_SECRET || 'xrey-master-key').digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(payload: string): string {
  const [version, ivRaw, tagRaw, dataRaw] = payload.split(':');
  if (version !== 'v1') throw new Error('Unsupported secret format');
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64')), decipher.final()]).toString('utf8');
}

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync, writeSync, writeFileSync } from 'fs';
import { pipeline } from 'stream/promises';

const MAGIC = Buffer.from('XSS1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + IV_LENGTH;
const AES_256_KEY_BYTES = 32;

export function backupEncryptionKey(): Buffer | null {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw.trim(), 'base64');
  return key.length === AES_256_KEY_BYTES ? key : null;
}

export async function encryptFile(source: string, target: string, key: Buffer): Promise<void> {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const header = Buffer.concat([MAGIC, Buffer.from([1]), iv]);
  writeFileSync(target, header);
  await pipeline(createReadStream(source), cipher, createWriteStream(target, { flags: 'a' }));
  const fd = openSync(target, 'r+');
  try {
    writeSync(fd, cipher.getAuthTag(), 0, TAG_LENGTH, HEADER_LENGTH + statSync(source).size);
  } finally {
    closeSync(fd);
  }
}

function readExactly(fd: number, length: number, position: number): Buffer {
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const n = readSync(fd, buffer, read, length - read, position + read);
    if (n === 0) throw new Error('Encrypted backup is truncated');
    read += n;
  }
  return buffer;
}

export async function decryptFile(source: string, target: string, key: Buffer): Promise<void> {
  const total = statSync(source).size;
  if (total <= HEADER_LENGTH + TAG_LENGTH) throw new Error('Encrypted backup is truncated');
  const fd = openSync(source, 'r');
  let header: Buffer;
  let tag: Buffer;
  try {
    header = readExactly(fd, HEADER_LENGTH, 0);
    tag = readExactly(fd, TAG_LENGTH, total - TAG_LENGTH);
  } finally {
    closeSync(fd);
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC) || header[MAGIC.length] !== 1) {
    throw new Error('Unsupported encrypted backup format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length + 1));
  decipher.setAuthTag(tag);
  const body = createReadStream(source, { start: HEADER_LENGTH, end: total - TAG_LENGTH - 1 });
  await pipeline(body, decipher, createWriteStream(target));
}

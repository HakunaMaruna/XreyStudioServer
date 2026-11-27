// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

type S3Config = {
  bucket: string;
  prefix: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function config(): S3Config | null {
  const bucket = process.env.BACKUP_S3_BUCKET;
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  if (!/^[a-z0-9][a-z0-9.-]{1,62}$/i.test(bucket)) throw new Error('Invalid BACKUP_S3_BUCKET');
  const prefix = process.env.BACKUP_S3_PREFIX || 'backups/';
  if (!/^[A-Za-z0-9/_-]{0,128}$/.test(prefix)) throw new Error('Invalid BACKUP_S3_PREFIX');
  const endpoint = process.env.BACKUP_S3_ENDPOINT;
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') throw new Error('BACKUP_S3_ENDPOINT must use https');
  }
  return {
    bucket,
    prefix,
    region: process.env.BACKUP_S3_REGION || 'auto',
    endpoint,
    accessKeyId,
    secretAccessKey,
  };
}

export function s3Enabled(): boolean {
  return Boolean(process.env.BACKUP_S3_BUCKET);
}

export async function uploadToS3(filePath: string, name: string): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: Boolean(cfg.endpoint),
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  const size = (await stat(filePath)).size;
  await client.send(new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: `${cfg.prefix}${name}`,
    Body: createReadStream(filePath),
    ContentLength: size,
    ContentType: 'application/octet-stream',
    // The object is already encrypted client-side with BACKUP_ENCRYPTION_KEY.
    ...(process.env.BACKUP_S3_SSE === 'AES256' ? { ServerSideEncryption: 'AES256' as const } : {}),
  }));
}

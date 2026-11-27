// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/** Short-lived deny-list for access-token JTIs. Redis when available, in-memory fallback otherwise. */
@Injectable()
export class TokenRevocationService implements OnModuleDestroy {
  private readonly redis: Redis | null = null;
  private readonly memory = new Map<string, number>();
  private redisReady = false;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) return;
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
    this.redis.on('ready', () => { this.redisReady = true; });
    this.redis.on('error', () => { this.redisReady = false; });
    this.redis.on('close', () => { this.redisReady = false; });
    this.redis.connect().catch(() => { this.redisReady = false; });
  }

  async revoke(jti: string, expiresAtMs: number) {
    const ttl = Math.max(1000, expiresAtMs - Date.now());
    if (this.redis && this.redisReady) {
      try {
        await this.redis.set(`xss:revoked:${jti}`, '1', 'PX', ttl);
        return;
      } catch {
        this.redisReady = false;
      }
    }
    this.memory.set(jti, Date.now() + ttl);
  }

  async isRevoked(jti: string) {
    if (this.redis && this.redisReady) {
      try {
        return Boolean(await this.redis.exists(`xss:revoked:${jti}`));
      } catch {
        this.redisReady = false;
      }
    }
    const until = this.memory.get(jti);
    if (!until) return false;
    if (until <= Date.now()) {
      this.memory.delete(jti);
      return false;
    }
    return true;
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }
}

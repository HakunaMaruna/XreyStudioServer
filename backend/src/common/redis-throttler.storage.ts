// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

type ThrottlerStorageRecord = { totalHits: number; timeToExpire: number };
import Redis from 'ioredis';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly redis: Redis | null = null;
  private readonly memory = new Map<string, { totalHits: number; expiresAt: number }>();
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

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    if (this.redis && this.redisReady) {
      try {
        const redisKey = `xss:throttle:${key}`;
        const totalHits = await this.redis.incr(redisKey);
        if (totalHits === 1) await this.redis.pexpire(redisKey, ttl);
        const remaining = await this.redis.pttl(redisKey);
        return { totalHits, timeToExpire: remaining > 0 ? remaining : ttl };
      } catch {
        this.redisReady = false;
      }
    }

    const now = Date.now();
    const current = this.memory.get(key);
    const record = current && current.expiresAt > now
      ? { totalHits: current.totalHits + 1, expiresAt: current.expiresAt }
      : { totalHits: 1, expiresAt: now + ttl };
    this.memory.set(key, record);
    return { totalHits: record.totalHits, timeToExpire: Math.max(0, record.expiresAt - now) };
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }
}

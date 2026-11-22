import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

type MemoryRecord = { hits: number; expiresAt: number };

/**
 * Redis-backed throttler storage shared by all backend replicas.
 * Falls back to an in-process map when Redis is not configured or unavailable.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, MemoryRecord>();
  private redisAvailable = false;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.redis = null;
      return;
    }

    this.redis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.redis.on('error', () => { this.redisAvailable = false; });
    this.redis.on('ready', () => {
      this.redisAvailable = true;
      this.logger.log('Rate limiting storage connected to Redis');
    });

    this.redis.connect().catch(() => {
      this.redisAvailable = false;
      this.logger.warn('Redis unavailable — using in-memory rate limiting');
    });
  }

  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    if (this.redis && this.redisAvailable) {
      try {
        const redisKey = `throttle:${key}`;
        const hits = await this.redis.incr(redisKey);
        if (hits === 1) await this.redis.pexpire(redisKey, ttl);
        const remaining = await this.redis.pttl(redisKey);
        return {
          totalHits: hits,
          timeToExpire: remaining > 0 ? remaining : ttl,
        };
      } catch {
        this.redisAvailable = false;
      }
    }

    const now = Date.now();
    const record = this.memory.get(key);
    if (!record || record.expiresAt <= now) {
      this.memory.set(key, { hits: 1, expiresAt: now + ttl });
      return { totalHits: 1, timeToExpire: ttl };
    }
    record.hits += 1;
    return { totalHits: record.hits, timeToExpire: Math.max(0, record.expiresAt - now) };
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }
}

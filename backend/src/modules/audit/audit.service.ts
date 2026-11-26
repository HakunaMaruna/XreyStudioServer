import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toCsv } from '../../common/csv';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    ip?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId || null,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId || null,
          ip: params.ip || null,
          metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Audit must never break the main request.
    }
  }

  findAll(params: {
    page?: number;
    limit?: number;
    entity?: string;
    userId?: string;
    action?: string;
    level?: 'destructive' | 'change' | 'info';
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const where: any = {};
    if (params.entity) where.entity = params.entity;
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = { contains: params.action, mode: 'insensitive' };
    const destructive = ['DELETE', 'REVOKE', 'BAN', 'ROLLBACK', 'RESET', 'RESTORE', 'REMOVE', 'DISABLE'];
    const change = ['CREATE', 'UPDATE', 'PATCH', 'APPLY', 'SYNC', 'IMPORT', 'SEED', 'POST', 'ENABLE'];
    const matches = (keywords: string[]) =>
      keywords.map((keyword) => ({ action: { contains: keyword, mode: 'insensitive' as const } }));
    if (params.level === 'destructive') where.OR = matches(destructive);
    else if (params.level === 'change') where.OR = matches(change);
    else if (params.level === 'info') where.NOT = { OR: matches([...destructive, ...change]) };
    return Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]).then(([data, total]) => ({ data, total, page, limit }));
  }

  async exportCsv(params: { entity?: string; userId?: string; action?: string; from?: string; to?: string }) {
    const where: any = {};
    if (params.entity) where.entity = params.entity;
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = { contains: params.action, mode: 'insensitive' };
    const from = params.from ? new Date(params.from) : null;
    const to = params.to ? new Date(params.to) : null;
    if (from && !Number.isNaN(from.getTime())) where.createdAt = { ...(where.createdAt || {}), gte: from };
    if (to && !Number.isNaN(to.getTime())) where.createdAt = { ...(where.createdAt || {}), lte: to };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
    });
    return toCsv(
      ['createdAt', 'userId', 'action', 'entity', 'entityId', 'ip', 'metadata'],
      rows.map((row) => [
        new Date(row.createdAt).toISOString(),
        row.userId || '',
        row.action,
        row.entity,
        row.entityId || '',
        row.ip || '',
        row.metadata ? JSON.stringify(row.metadata) : '',
      ]),
    );
  }
}

import { Injectable } from '@nestjs/common';
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
          metadata: params.metadata || undefined,
        },
      });
    } catch {
      // Audit must never break the main request.
    }
  }

  findAll(params: { page?: number; limit?: number; entity?: string; userId?: string }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const where: any = {};
    if (params.entity) where.entity = params.entity;
    if (params.userId) where.userId = params.userId;
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
}

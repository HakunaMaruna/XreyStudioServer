import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { ApiTokenScope, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ApiTokenContext = {
  tokenId: string;
  userId: string;
  role: Role;
  organizationId: string | null;
  scopes: ApiTokenScope[];
};

const TOKEN_PREFIX = 'xss_';

@Injectable()
export class ApiTokensService {
  constructor(private prisma: PrismaService) {}

  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }

  async create(input: {
    name: string;
    scopes: ApiTokenScope[];
    organizationId?: string | null;
    expiresAt?: Date | null;
    actor: { userId: string; role: Role; organizationId?: string | null };
  }): Promise<{ id: string; name: string; token: string; scopes: ApiTokenScope[]; expiresAt: Date | null }> {
    const name = input.name?.trim();
    if (!name || name.length > 120) {
      throw new BadRequestException('name must be 1-120 characters');
    }
    if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
      throw new BadRequestException('scopes must be a non-empty array');
    }
    const allowed = Object.values(ApiTokenScope) as string[];
    if (input.scopes.some((s) => !allowed.includes(s))) {
      throw new BadRequestException('unknown scope');
    }
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future');
    }
    if (input.actor.role !== Role.ADMIN && input.scopes.includes(ApiTokenScope.USERS_READ)) {
      throw new BadRequestException('USERS_READ requires ADMIN');
    }

    const raw = `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
    const tokenHash = this.hashToken(raw);
    const created = await this.prisma.apiToken.create({
      data: {
        name,
        tokenHash,
        scopes: input.scopes,
        userId: input.actor.userId,
        organizationId:
          input.actor.role === Role.ADMIN ? (input.organizationId ?? null) : (input.actor.organizationId ?? null),
        expiresAt: input.expiresAt ?? null,
      },
      select: { id: true, name: true, scopes: true, expiresAt: true },
    });
    return { ...created, token: raw };
  }

  async verify(raw: string | undefined): Promise<ApiTokenContext> {
    if (!raw || !raw.startsWith(TOKEN_PREFIX) || raw.length > 256) {
      throw new UnauthorizedException('Invalid API token');
    }
    const tokenHash = this.hashToken(raw);
    const record = await this.prisma.apiToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { role: true, status: true } } },
    });
    if (!record || record.revokedAt || (record.expiresAt && record.expiresAt.getTime() <= Date.now())) {
      throw new UnauthorizedException('Invalid API token');
    }
    if (record.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid API token');
    }
    // Constant-time compare of the stored digest protects against timing leaks even though
    // the lookup itself is by the indexed hash.
    if (!this.safeEqual(record.tokenHash, tokenHash)) {
      throw new UnauthorizedException('Invalid API token');
    }
    await this.prisma.apiToken.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      tokenId: record.id,
      userId: record.userId,
      role: record.user.role,
      organizationId: record.organizationId,
      scopes: record.scopes,
    };
  }

  async list(organizationId?: string | null) {
    return this.prisma.apiToken.findMany({
      where: organizationId ? { organizationId } : {},
      select: {
        id: true,
        name: true,
        scopes: true,
        userId: true,
        organizationId: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(id: string, actor: { role: Role; organizationId?: string | null }) {
    const token = await this.prisma.apiToken.findUnique({ where: { id } });
    if (!token || token.revokedAt) throw new NotFoundException('Token not found');
    if (actor.role !== Role.ADMIN && token.organizationId !== (actor.organizationId ?? null)) {
      throw new NotFoundException('Token not found');
    }
    return this.prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    });
  }
}

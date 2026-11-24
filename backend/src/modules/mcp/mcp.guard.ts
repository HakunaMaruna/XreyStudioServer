import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createHash, timingSafeEqual } from 'crypto';
import { getJwtSecret } from '../../common/env';
import { McpActor } from './mcp-plan.service';

@Injectable()
export class McpGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const bearer = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    const mcpToken = String(req.headers?.['x-mcp-token'] || '');
    const expected = process.env.MCP_TOKEN || '';

    if (expected) {
      for (const candidate of [mcpToken, bearer]) {
        if (candidate && this.matches(candidate, expected)) {
          req.mcpActor = await this.actorFromMcpToken(candidate);
          return true;
        }
      }
    }

    if (bearer) {
      let payload: { type?: string; sub?: string; email?: string; role?: string; orgId?: string | null } | undefined;
      try {
        payload = await this.jwt.verifyAsync(bearer, { secret: getJwtSecret() });
      } catch {
        // fall through to 401
      }
      if (payload && payload.type !== 'refresh' && payload.role === Role.ADMIN) {
        const userId = String(payload.sub ?? '');
        if (!userId) throw new UnauthorizedException('MCP JWT has no subject');
        const actor = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, role: true, organizationId: true, status: true },
        });
        if (!actor || actor.status !== 'ACTIVE' || actor.role !== Role.ADMIN) {
          throw new UnauthorizedException('MCP admin account is unavailable');
        }
        req.mcpActor = {
          userId: actor.id,
          email: actor.email,
          role: actor.role,
          organizationId: actor.organizationId,
        };
        return true;
      }
    }
    throw new UnauthorizedException('MCP token or admin JWT required');
  }

  /** An MCP token is an owner credential: derive a stable, non-impersonated actor id from it. */
  private async actorFromMcpToken(token: string): Promise<McpActor> {
    const fingerprint = createHash('sha256').update(token, 'utf8').digest('hex');
    return {
      userId: `mcp-token:${fingerprint}`,
      role: Role.ADMIN,
      email: 'mcp-token',
    };
  }

  private matches(actual: string, expected: string) {
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

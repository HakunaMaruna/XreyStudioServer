import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import { getJwtSecret } from '../../common/env';

@Injectable()
export class McpGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const bearer = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    const mcpToken = String(req.headers?.['x-mcp-token'] || '');
    const expected = process.env.MCP_TOKEN || '';

    if (expected) {
      for (const candidate of [mcpToken, bearer]) {
        if (candidate && this.matches(candidate, expected)) return true;
      }
    }

    if (bearer) {
      try {
        const payload = await this.jwt.verifyAsync(bearer, { secret: getJwtSecret() });
        if (payload.type !== 'refresh' && payload.role === 'ADMIN') return true;
      } catch {
        // fall through to 401
      }
    }
    throw new UnauthorizedException('MCP token or admin JWT required');
  }

  private matches(actual: string, expected: string) {
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTokenScope } from '@prisma/client';
import { ApiTokensService, ApiTokenContext } from './api-tokens.service';

export const REQUIRED_SCOPE_KEY = 'api-token-required-scope';
export const RequireScope = (scope: ApiTokenScope) => SetMetadata(REQUIRED_SCOPE_KEY, scope);

export const ApiTokenUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiTokenContext => {
    return ctx.switchToHttp().getRequest().apiToken;
  },
);

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tokens: ApiTokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['x-api-token'];
    if (!header) {
      throw new UnauthorizedException('X-API-Token header is required');
    }

    let ctx: ApiTokenContext;
    try {
      ctx = await this.tokens.verify(header);
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid API token');
    }

    const required = this.reflector.getAllAndOverride<ApiTokenScope | undefined>(REQUIRED_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !ctx.scopes.includes(required)) {
      throw new ForbiddenException(`Scope ${required} is required`);
    }
    req.apiToken = ctx;
    // Also expose the principal so existing RolesGuard / decorators work for API-token calls.
    req.user = {
      userId: ctx.userId,
      email: `api-token:${ctx.tokenId}`,
      role: ctx.role,
      organizationId: ctx.organizationId,
    };
    return true;
  }
}

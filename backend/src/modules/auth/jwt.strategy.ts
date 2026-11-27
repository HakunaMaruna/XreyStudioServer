// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getJwtSecret } from '../../common/env';
import { TokenRevocationService } from './token-revocation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService, private revocation: TokenRevocationService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
      issuer: 'xreystudio',
      audience: 'xrey-panel',
      algorithms: ['HS256'],
    });
  }

  async validate(payload: any) {
    if (payload.type === 'refresh') throw new UnauthorizedException('Wrong token type');
    if (typeof payload.jti === 'string' && await this.revocation.isRevoked(payload.jti)) {
      throw new UnauthorizedException('Token revoked');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User unavailable');
    if (user.expiresAt && user.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Subscription expired');
    }
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
  }
}

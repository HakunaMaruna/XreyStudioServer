// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { getJwtSecret } from '../../common/env';
import { TokenRevocationService } from './token-revocation.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '5m', issuer: 'xreystudio', audience: 'xrey-panel' },
      verifyOptions: { issuer: 'xreystudio', audience: 'xrey-panel', algorithms: ['HS256'] },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenRevocationService],
  exports: [AuthService, TokenRevocationService],
})
export class AuthModule {}

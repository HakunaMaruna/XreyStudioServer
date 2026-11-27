// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { BalancersController } from './balancers.controller';
import { BalancersService } from './balancers.service';

@Module({
  controllers: [BalancersController],
  providers: [BalancersService],
  exports: [BalancersService],
})
export class BalancersModule {}

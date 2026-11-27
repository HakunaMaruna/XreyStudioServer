// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { ReverseController } from './reverse.controller';
import { ReverseService } from './reverse.service';

@Module({
  controllers: [ReverseController],
  providers: [ReverseService],
  exports: [ReverseService],
})
export class ReverseModule {}

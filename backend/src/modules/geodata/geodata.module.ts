// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { GeodataController } from './geodata.controller';
import { GeodataService } from './geodata.service';

@Module({
  controllers: [GeodataController],
  providers: [GeodataService],
  exports: [GeodataService],
})
export class GeodataModule {}

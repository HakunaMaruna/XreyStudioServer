// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';

@Module({
  imports: [ConfigModule],
  controllers: [DoctorController],
  providers: [DoctorService],
})
export class DoctorModule {}

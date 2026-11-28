// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { NodeProvisionModule } from '../node-provision/node-provision.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';

@Module({
  imports: [ConfigModule, NodeProvisionModule, CertificatesModule],
  controllers: [DoctorController],
  providers: [DoctorService],
})
export class DoctorModule {}

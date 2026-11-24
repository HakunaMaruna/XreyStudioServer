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

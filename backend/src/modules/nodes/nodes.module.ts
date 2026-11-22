import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ConfigModule } from '../config/config.module';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';

@Module({
  imports: [AuditModule, ConfigModule],
  controllers: [NodesController],
  providers: [NodesService],
  exports: [NodesService],
})
export class NodesModule {}

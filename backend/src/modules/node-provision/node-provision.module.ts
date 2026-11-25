import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NodeProvisionController } from './node-provision.controller';
import { NodeProvisionService } from './node-provision.service';

@Module({
  imports: [AuditModule],
  controllers: [NodeProvisionController],
  providers: [NodeProvisionService],
  exports: [NodeProvisionService],
})
export class NodeProvisionModule {}

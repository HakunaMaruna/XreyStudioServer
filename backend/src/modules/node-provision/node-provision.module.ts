import { Module } from '@nestjs/common';
import { NodeProvisionController } from './node-provision.controller';
import { NodeProvisionService } from './node-provision.service';

@Module({
  controllers: [NodeProvisionController],
  providers: [NodeProvisionService],
})
export class NodeProvisionModule {}

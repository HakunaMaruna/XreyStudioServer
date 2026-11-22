import { Module } from '@nestjs/common';
import { NodesModule } from '../nodes/nodes.module';
import { TrafficController } from './traffic.controller';
import { TrafficService } from './traffic.service';

@Module({
  imports: [NodesModule],
  controllers: [TrafficController],
  providers: [TrafficService],
  exports: [TrafficService],
})
export class TrafficModule {}

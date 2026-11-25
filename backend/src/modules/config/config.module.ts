import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BalancersModule } from '../balancers/balancers.module';
import { AgentClientService } from './agent-client.service';
import { ConfigGeneratorService } from './config-generator.service';

@Module({
  imports: [NotificationsModule, BalancersModule],
  providers: [ConfigGeneratorService, AgentClientService],
  exports: [ConfigGeneratorService, AgentClientService],
})
export class ConfigModule {}

import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AgentClientService } from './agent-client.service';
import { ConfigGeneratorService } from './config-generator.service';

@Module({
  imports: [NotificationsModule],
  providers: [ConfigGeneratorService, AgentClientService],
  exports: [ConfigGeneratorService, AgentClientService],
})
export class ConfigModule {}

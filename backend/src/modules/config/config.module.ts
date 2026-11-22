import { Module } from '@nestjs/common';
import { AgentClientService } from './agent-client.service';
import { ConfigGeneratorService } from './config-generator.service';

@Module({
  providers: [ConfigGeneratorService, AgentClientService],
  exports: [ConfigGeneratorService, AgentClientService],
})
export class ConfigModule {}

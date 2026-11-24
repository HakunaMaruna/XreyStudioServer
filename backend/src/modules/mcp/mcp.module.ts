import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getJwtSecret } from '../../common/env';
import { McpController } from './mcp.controller';
import { McpGuard } from './mcp.guard';
import { McpService } from './mcp.service';

@Module({
  imports: [JwtModule.register({ secret: getJwtSecret() })],
  controllers: [McpController],
  providers: [McpService, McpGuard],
  exports: [McpService],
})
export class McpModule {}

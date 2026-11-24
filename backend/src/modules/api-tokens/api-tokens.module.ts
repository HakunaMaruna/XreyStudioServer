import { Module } from '@nestjs/common';
import { ApiTokensService } from './api-tokens.service';
import { ApiTokensController, MonitorController } from './api-tokens.controller';
import { ApiTokenGuard } from './api-token.guard';

@Module({
  controllers: [ApiTokensController, MonitorController],
  providers: [ApiTokensService, ApiTokenGuard],
  exports: [ApiTokensService, ApiTokenGuard],
})
export class ApiTokensModule {}

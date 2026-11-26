import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PluginsModule } from '../plugins/plugins.module';
import { InboundRecipesService } from './inbound-recipes.service';
import { InboundsController } from './inbounds.controller';
import { InboundsService } from './inbounds.service';

@Module({
  imports: [AuditModule, PluginsModule],
  controllers: [InboundsController],
  providers: [InboundsService, InboundRecipesService],
  exports: [InboundsService],
})
export class InboundsModule {}

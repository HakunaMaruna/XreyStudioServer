import { Module } from '@nestjs/common';
import { ConfigProfilesController } from './config-profiles.controller';
import { ConfigProfilesService } from './config-profiles.service';

@Module({
  controllers: [ConfigProfilesController],
  providers: [ConfigProfilesService],
  exports: [ConfigProfilesService],
})
export class ConfigProfilesModule {}

import { Module } from '@nestjs/common';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';
import { PowerDnsService } from './powerdns.service';

@Module({
  imports: [ApiTokensModule],
  controllers: [ControlController],
  providers: [ControlService, PowerDnsService],
  exports: [ControlService, PowerDnsService],
})
export class ControlModule {}

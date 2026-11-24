import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { ControlModule } from '../control/control.module';
import { NodeProvisionModule } from '../node-provision/node-provision.module';
import { WizardController } from './wizard.controller';
import { WizardService } from './wizard.service';

@Module({
  imports: [ConfigModule, ControlModule, NodeProvisionModule],
  controllers: [WizardController],
  providers: [WizardService],
})
export class WizardModule {}

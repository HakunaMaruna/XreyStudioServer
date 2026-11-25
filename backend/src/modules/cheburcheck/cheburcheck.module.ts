import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CheburcheckController } from './cheburcheck.controller';
import { CheburcheckService } from './cheburcheck.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CheburcheckController],
  providers: [CheburcheckService],
})
export class CheburcheckModule {}

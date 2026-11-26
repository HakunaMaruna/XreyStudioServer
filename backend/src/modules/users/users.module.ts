import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InboundsModule } from '../inbounds/inbounds.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuditModule, InboundsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

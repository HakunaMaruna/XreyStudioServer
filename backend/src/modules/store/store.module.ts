import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.service';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

@Module({
  imports: [PrismaModule],
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule {}

import { Module } from '@nestjs/common';
import { GeodataController } from './geodata.controller';
import { GeodataService } from './geodata.service';

@Module({
  controllers: [GeodataController],
  providers: [GeodataService],
  exports: [GeodataService],
})
export class GeodataModule {}

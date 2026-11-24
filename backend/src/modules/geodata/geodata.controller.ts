import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GeodataService } from './geodata.service';

@Controller('geodata')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class GeodataController {
  constructor(private readonly service: GeodataService) {}

  @Get() list(@Query() query: { type?: string; search?: string; enabled?: string }) {
    return this.service.list(query);
  }

  @Post('seed') seed() {
    return this.service.seed();
  }

  @Post() create(@Body() body: { type: string; code: string; name: string; description?: string; enabled?: boolean }) {
    return this.service.create(body);
  }

  @Patch(':id') update(@Param('id') id: string, @Body() body: { name?: string; description?: string; enabled?: boolean }) {
    return this.service.update(id, body);
  }

  @Delete(':id') remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

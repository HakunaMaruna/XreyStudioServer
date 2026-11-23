import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SquadsService } from './squads.service';

@Controller('squads')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class SquadsController {
  constructor(private readonly service: SquadsService) {}

  @Get() list() { return this.service.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.service.find(id); }
  @Post() create(@Body() body: any) { return this.service.create(body); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: any) { return this.service.update(id, body); }
  @Patch(':id/members') members(@Param('id') id: string, @Body() body: { userIds?: string[] }) {
    return this.service.setMembers(id, body.userIds || []);
  }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ReverseService } from './reverse.service';
import { CreateReverseDto, UpdateReverseDto } from './dto/reverse.dto';

@Controller('reverse')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class ReverseController {
  constructor(private readonly service: ReverseService) {}

  @Get() list(@CurrentUser() user: AuthUser) { return this.service.list(user); }
  @Post() create(@Body() body: CreateReverseDto, @CurrentUser() user: AuthUser) { return this.service.create(body, user); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateReverseDto, @CurrentUser() user: AuthUser) { return this.service.update(id, body, user); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.remove(id, user); }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateRuleDto, UpdateRuleDto, ValidateRuleDto } from './dto/rule.dto';
import { RulesService } from './rules.service';

@Controller('rules')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class RulesController {
  constructor(private service: RulesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user);
  }

  @Post()
  create(@Body() body: CreateRuleDto, @CurrentUser() user: AuthUser) {
    return this.service.create(body, user);
  }

  @Get('recipes/list')
  recipes() {
    return this.service.recipes();
  }

  @Post('validate')
  validate(@Body() body: ValidateRuleDto) {
    return this.service.validate(body.payload);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateRuleDto, @CurrentUser() user: AuthUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}

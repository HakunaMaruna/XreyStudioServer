import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ProvisionNodeDto } from './dto/provision.dto';
import { NodeProvisionService } from './node-provision.service';

@Controller('node-provision')
export class NodeProvisionController {
  constructor(private service: NodeProvisionService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  provision(@Body() dto: ProvisionNodeDto, @CurrentUser() user: AuthUser) {
    return this.service.provision(dto, user);
  }
}

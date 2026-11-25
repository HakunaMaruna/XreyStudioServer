import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionPageService } from './subscription-page.service';
import { UpdatePageSettingsDto, UpdateVpnAppDto, VpnAppDto } from './dto/subscription-page.dto';

@Controller('subscription-page')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class SubscriptionPageController {
  constructor(private readonly service: SubscriptionPageService) {}

  @Get('settings')
  settings() { return this.service.getSettings(); }

  @Patch('settings')
  updateSettings(@Body() body: UpdatePageSettingsDto) { return this.service.updateSettings(body as any); }

  @Get('apps')
  apps(@CurrentUser() user: AuthUser) { return this.service.listApps(user); }

  @Post('apps')
  createApp(@Body() body: VpnAppDto, @CurrentUser() user: AuthUser) { return this.service.createApp(body, user); }

  @Patch('apps/:id')
  updateApp(@Param('id') id: string, @Body() body: UpdateVpnAppDto, @CurrentUser() user: AuthUser) {
    return this.service.updateApp(id, body, user);
  }

  @Delete('apps/:id')
  removeApp(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.service.removeApp(id, user); }
}

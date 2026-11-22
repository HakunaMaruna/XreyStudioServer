import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Post('test')
  test(@Body() body: { text?: string }) {
    return this.service.broadcast({
      text: body.text || 'XSS test notification',
      subject: 'XSS test notification',
      webhook: { event: 'test' },
    });
  }

  @Get('channels')
  channels() {
    return this.service.channels();
  }

  @Get('alerts')
  alerts(@Query() query: { page?: string; limit?: string; status?: string }) {
    return this.service.listAlerts(query);
  }
}

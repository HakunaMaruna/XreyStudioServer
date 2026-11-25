import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SnapshotBefore } from '../snapshots/snapshot-before.decorator';
import { TestNotificationDto, UpdateNotificationSettingsDto, DeliveryQueryDto } from './dto/notification-settings.dto';
import { NotificationsService } from './notifications.service';
import { NotificationSettingsService } from './notification-settings.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class NotificationsController {
  constructor(
    private service: NotificationsService,
    private settings: NotificationSettingsService,
  ) {}

  @Post('test')
  test(@Body() body: TestNotificationDto) {
    return this.service.broadcast({
      text: body.text || 'XSS test notification',
      subject: 'XSS test notification',
      webhook: { event: 'test' },
    }, body.channel);
  }

  @Get('channels')
  async channels() {
    return this.service.channels();
  }

  @Get('settings')
  async settingsGet() {
    const [configured, policy] = await Promise.all([
      this.settings.configured(),
      this.settings.policy(),
    ]);
    return { configured, policy };
  }

  @Patch('settings')
  @SnapshotBefore('settings', 'Notification policy update')
  async settingsUpdate(@Body() body: UpdateNotificationSettingsDto) {
    try {
      if (body.credentials) await this.settings.setCredentials(body.credentials);
      if (body.policy) await this.settings.setPolicy(body.policy);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
    const [configured, policy] = await Promise.all([
      this.settings.configured(),
      this.settings.policy(),
    ]);
    return { configured, policy };
  }

  @Get('deliveries')
  deliveries(@Query() query: DeliveryQueryDto) {
    return this.settings.deliveries(Number(query.limit || 50));
  }

  @Get('alerts')
  alerts(@Query() query: { page?: string; limit?: string; status?: string }) {
    return this.service.listAlerts(query);
  }
}

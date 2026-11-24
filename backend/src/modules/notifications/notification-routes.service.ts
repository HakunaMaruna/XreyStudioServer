import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationEvent } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const SUPPORTED_EVENTS = Object.values(NotificationEvent);
export const SUPPORTED_CHANNELS = Object.values(NotificationChannel);

@Injectable()
export class NotificationRoutesService {
  constructor(private prisma: PrismaService) {}

  async enabledChannels(event: NotificationEvent, organizationId?: string | null) {
    const routes = await this.prisma.notificationRoute.findMany({
      where: {
        event,
        enabled: true,
        OR: [{ organizationId: null }, ...(organizationId ? [{ organizationId }] : [])],
      },
      select: { channel: true },
    });
    return [...new Set(routes.map((r) => r.channel))];
  }

  async list(organizationId?: string | null) {
    return this.prisma.notificationRoute.findMany({
      where: organizationId ? { organizationId } : {},
      orderBy: [{ event: 'asc' }, { channel: 'asc' }],
    });
  }

  async set(input: {
    event: NotificationEvent;
    channel: NotificationChannel;
    enabled: boolean;
    organizationId?: string | null;
  }) {
    if (!SUPPORTED_EVENTS.includes(input.event) || !SUPPORTED_CHANNELS.includes(input.channel)) {
      throw new BadRequestException('Unknown event or channel');
    }
    const orgId = input.organizationId ?? null;
    return this.prisma.notificationRoute.upsert({
      where: {
        event_channel_organizationId: {
          event: input.event,
          channel: input.channel,
          organizationId: orgId,
        },
      },
      create: {
        event: input.event,
        channel: input.channel,
        enabled: input.enabled,
        organizationId: orgId,
      },
      update: { enabled: input.enabled },
    });
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Controller, ForbiddenException, Get, Param, Query, Req, Res } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { detectSubscriptionFormat, parseSubscriptionFormat } from './subscription-format';
import { DevicesService } from '../devices/devices.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private service: SubscriptionsService, private devices: DevicesService) {}

  private async checkDevice(token: string, hwid?: string) {
    if (!hwid) return;
    const status = await this.service.getStatus(token);
    const user = await this.service.loadUser(token);
    if (user.deviceLimit > 0 && status.deviceCount >= user.deviceLimit && !status.deviceIds.includes(hwid)) {
      throw new ForbiddenException('Device limit reached');
    }
    await this.devices.touch(hwid);
  }

  private send(res: any, type: string, body: any, headers?: Record<string, string>) {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Referrer-Policy', 'no-referrer');
    for (const [key, value] of Object.entries(headers || {})) res.setHeader(key, value);
    return res.type(type).send(body);
  }

  private async clientHeaders(token: string) {
    return this.service.subscriptionHeaders(token);
  }

  @Get('preview')
  async preview(@Res() res: any) {
    return this.send(res, 'application/json', await this.service.preview());
  }

  @Get(':token/raw')
  async raw(@Param('token') token: string, @Query('hwid') hwid: string | undefined, @Res() res: any) {
    await this.checkDevice(token, hwid);
    return this.send(res, 'text/plain', await this.service.raw(token), await this.clientHeaders(token));
  }

  @Get(':token/base64')
  async base64(@Param('token') token: string, @Query('hwid') hwid: string | undefined, @Res() res: any) {
    await this.checkDevice(token, hwid);
    return this.send(res, 'text/plain', await this.service.base64(token), await this.clientHeaders(token));
  }

  @Get(':token/clash')
  async clash(@Param('token') token: string, @Query('hwid') hwid: string | undefined, @Res() res: any) {
    await this.checkDevice(token, hwid);
    return this.send(res, 'text/yaml', await this.service.clash(token), await this.clientHeaders(token));
  }

  @Get(':token/singbox')
  async singbox(@Param('token') token: string, @Query('hwid') hwid: string | undefined, @Res() res: any) {
    await this.checkDevice(token, hwid);
    return this.send(res, 'application/json', await this.service.singbox(token), await this.clientHeaders(token));
  }

  @Get(':token/json')
  async getJson(@Param('token') token: string, @Query('hwid') hwid: string | undefined, @Res() res: any) {
    await this.checkDevice(token, hwid);
    return this.send(res, 'application/json', await this.service.json(token), await this.clientHeaders(token));
  }

  @Get(':token')
  async get(
    @Param('token') token: string,
    @Query('format') format: string | undefined,
    @Query('hwid') hwid: string | undefined,
    @Req() req: any,
    @Res() res: any,
  ) {
    await this.checkDevice(token, hwid);
    const selected =
      parseSubscriptionFormat(format) || detectSubscriptionFormat(req.headers['user-agent']);

    switch (selected) {
      case 'raw':
        return this.send(res, 'text/plain', await this.service.raw(token), await this.clientHeaders(token));
      case 'base64':
        return this.send(res, 'text/plain', await this.service.base64(token), await this.clientHeaders(token));
      case 'clash':
        return this.send(res, 'text/yaml', await this.service.clash(token), await this.clientHeaders(token));
      case 'singbox':
        return this.send(res, 'application/json', await this.service.singbox(token), await this.clientHeaders(token));
      default:
        return this.send(res, 'application/json', await this.service.json(token), await this.clientHeaders(token));
    }
  }
}

import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private service: SubscriptionsService) {}

  @Get(':token/raw')
  async raw(@Param('token') token: string, @Res() res: any) {
    res.type('text/plain').send(await this.service.raw(token));
  }

  @Get(':token/base64')
  async base64(@Param('token') token: string, @Res() res: any) {
    res.type('text/plain').send(await this.service.base64(token));
  }

  @Get(':token/clash')
  async clash(@Param('token') token: string, @Res() res: any) {
    res.type('text/yaml').send(await this.service.clash(token));
  }

  @Get(':token/singbox')
  async singbox(@Param('token') token: string, @Res() res: any) {
    res.type('application/json').send(await this.service.singbox(token));
  }

  @Get(':token/json')
  async getJson(@Param('token') token: string) {
    await this.service.assertUsable(token);
    return this.service.json(token);
  }

  @Get(':token')
  async get(
    @Param('token') token: string,
    @Query('format') format: string | undefined,
    @Req() req: any,
    @Res() res: any,
  ) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    const selected =
      format || (ua.includes('clash') ? 'clash' : ua.includes('sing-box') ? 'singbox' : 'json');

    switch (selected) {
      case 'raw':
        return res.type('text/plain').send(await this.service.raw(token));
      case 'base64':
        return res.type('text/plain').send(await this.service.base64(token));
      case 'clash':
        return res.type('text/yaml').send(await this.service.clash(token));
      case 'singbox':
        return res.type('application/json').send(await this.service.singbox(token));
      default:
        return res.json(await this.service.json(token));
    }
  }
}

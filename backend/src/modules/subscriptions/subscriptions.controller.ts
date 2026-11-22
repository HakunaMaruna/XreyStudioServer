import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private service: SubscriptionsService) {}

  @Get(':token')
  get(@Param('token') token: string, @Req() req: any, @Res() res: any) {
    const data = this.service.getStatus(token);
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (ua.includes('clash')) {
      return res.type('text/plain').send('proxies: []');
    }
    if (ua.includes('sing-box')) {
      return res.type('application/json').send({ outbounds: [] });
    }
    return res.json(data);
  }

  @Get(':token/raw')
  raw(@Param('token') token: string) {
    const d = this.service.getStatus(token);
    return Object.values(d.links).join('\n');
  }

  @Get(':token/base64')
  base64(@Param('token') token: string) {
    const d = this.service.getStatus(token);
    const raw = Object.values(d.links).join('\n');
    return Buffer.from(raw).toString('base64');
  }
}

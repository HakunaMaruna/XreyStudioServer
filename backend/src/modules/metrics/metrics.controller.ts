import { Controller, Get, Headers, Res } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private service: MetricsService) {}

  @Get()
  async metrics(@Headers('x-metrics-token') token: string, @Res() res: any) {
    if (process.env.METRICS_TOKEN && token !== process.env.METRICS_TOKEN) {
      return res.status(403).send('Forbidden');
    }
    res.type('text/plain').send(await this.service.render());
  }
}

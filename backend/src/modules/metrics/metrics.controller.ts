import { Controller, Get, Headers, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private service: MetricsService) {}

  @Get()
  async metrics(@Headers('x-metrics-token') token: string, @Res() res: any) {
    const expected = process.env.METRICS_TOKEN;
    if (expected) {
      const a = Buffer.from(token || '');
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return res.status(403).send('Forbidden');
      }
    }
    res.type('text/plain').send(await this.service.render());
  }

  @Get('view')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async view(@Res() res: any) {
    res.type('text/plain').send(await this.service.render());
  }
}

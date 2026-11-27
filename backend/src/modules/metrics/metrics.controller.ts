// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Controller, Get, Headers, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MetricsService } from './metrics.service';
import { HostMetricsService } from './host-metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private service: MetricsService, private host: HostMetricsService) {}

  @Get()
  async metrics(@Headers('x-metrics-token') token: string, @Res() res: any) {
    const expected = process.env.METRICS_TOKEN;
    if (!expected) {
      // В проде метрики не должны быть публичными. В dev/test токен можно не задавать.
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).send('METRICS_TOKEN is not configured');
      }
    } else {
      const a = Buffer.from(token || '');
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return res.status(403).send('Forbidden');
      }
    }
    res.type('text/plain').send(await this.service.render());
  }

  @Get('host')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  hostMetrics() {
    return this.host.read();
  }

  @Get('traffic/nodes')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  nodeTraffic() {
    return this.service.nodeTraffic();
  }

  @Get('view')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async view(@Res() res: any) {
    res.type('text/plain').send(await this.service.render());
  }
}

import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TrafficReportDto } from './dto/traffic.dto';
import { TrafficService } from './traffic.service';

@Controller()
export class TrafficController {
  constructor(private service: TrafficService) {}

  @Post('nodes/:id/traffic')
  report(
    @Param('id') id: string,
    @Body() body: TrafficReportDto,
    @Headers('authorization') auth?: string,
  ) {
    const token = (auth || '').replace(/^Bearer\s+/i, '');
    return this.service.report(id, body, token);
  }

  @Get('traffic')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  history(@Query() query: { userId?: string; page?: string; limit?: string }) {
    return this.service.history(query);
  }
}

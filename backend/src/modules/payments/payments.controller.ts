import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private service: PaymentsService) {}

  @Post('webhook')
  webhook(@Body() body: any) {
    return this.service.webhook(body);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  list() {
    return this.service.list();
  }

  @Get('plans')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  plans() {
    return this.service.plans();
  }

  @Post('plans')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  createPlan(@Body() body: { name: string; price: number; trafficGb: number; durationDays: number }) {
    return this.service.createPlan(body);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  create(
    @Body() body: { userId: string; amount: number; currency?: string; provider?: string },
  ) {
    return this.service.create(body.userId, body.amount, body.currency, body.provider);
  }

  @Post(':id/paid')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  markPaid(@Param('id') id: string) {
    return this.service.markPaid(id);
  }
}

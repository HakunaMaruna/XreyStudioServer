import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private service: PaymentsService) {}

  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.service.handleWebhook(req.rawBody, signature);
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

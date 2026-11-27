// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { sendCsv } from '../../common/csv';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreatePaymentDto, CreatePlanDto, UpdatePlanDto } from './dto/payment.dto';
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

  @Get('export.csv')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  async export(@Query() query: { from?: string; to?: string }, @Res() res: any) {
    sendCsv(res, 'payments.csv', await this.service.exportCsv(query));
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  list() {
    return this.service.list();
  }

  @Get('plans')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  plans() {
    return this.service.plans();
  }

  @Post('plans')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  createPlan(@Body() body: CreatePlanDto) {
    return this.service.createPlan(body);
  }

  @Patch('plans/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  updatePlan(@Param('id') id: string, @Body() body: UpdatePlanDto) {
    return this.service.updatePlan(id, body);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() body: CreatePaymentDto) {
    return this.service.create(body.userId, body.amount, body.currency, body.provider, body.planId);
  }

  @Post(':id/paid')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN)
  markPaid(@Param('id') id: string) {
    return this.service.markPaid(id);
  }
}

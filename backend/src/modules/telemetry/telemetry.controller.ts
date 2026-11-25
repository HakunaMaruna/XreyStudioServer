import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ApiTokenGuard, ApiTokenUser, RequireScope } from '../api-tokens/api-token.guard';
import type { ApiTokenContext } from '../api-tokens/api-tokens.service';
import { TelemetryPayload, TelemetryService } from './telemetry.service';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly service: TelemetryService) {}

  /** Public consent state for the first-run modal (requires login). */
  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  status() {
    return this.service.status();
  }

  /** Data that would be sent — lets the administrator review before consenting. */
  @Get('preview')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  preview() {
    return this.service.collect();
  }

  @Post('consent')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  consent(@Body() body: { accepted: boolean; enabled: boolean }) {
    return this.service.consent(body);
  }

  @Post('send')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  send() {
    return this.service.send();
  }

  /** MAIN SERVER: receives anonymized installation statistics. */
  @Post('ingest')
  @UseGuards(ApiTokenGuard)
  @RequireScope('TELEMETRY' as any)
  ingest(@Body() body: TelemetryPayload, @ApiTokenUser() token: ApiTokenContext) {
    return this.service.ingest(body, token);
  }

  /** MAIN SERVER: overview of all installations and received logs. */
  @Get('installations')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  installations() {
    return this.service.installations();
  }

  @Get('logs')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  logs(@Query('limit') limit?: string) {
    return this.service.logs(Number(limit) || 100);
  }
}

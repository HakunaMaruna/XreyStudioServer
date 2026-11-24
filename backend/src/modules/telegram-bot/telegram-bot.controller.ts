import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Get,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramLoginService } from './telegram-login.service';

interface BindDto {
  telegramId?: unknown;
}

@Controller('telegram')
export class TelegramBotController {
  constructor(
    private readonly bot: TelegramBotService,
    private readonly login: TelegramLoginService,
  ) {}

  /** Public Telegram webhook, authorized by Telegram's secret-token header. */
  @Post('webhook')
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: unknown,
    @Body() body: unknown,
  ): Promise<{ ok: boolean }> {
    if (typeof secret !== 'string' || !this.matchesSecret(secret)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
    await this.bot.handleUpdate(body);
    return { ok: true };
  }

  /** Redeems a one-time signed token issued by /start. */
  @Get('login/validate')
  validate(@Query('token') token: unknown): { telegramId: number } {
    return this.login.validateLoginToken(token);
  }

  /** Links the validated Telegram id to the JWT session user. */
  @Post('login/bind')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(Role.ADMIN, Role.USER)
  bind(@Body() body: BindDto, @CurrentUser() user: AuthUser): { linked: true; telegramId: number } {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ForbiddenException('Invalid bind request');
    }
    return this.login.bindTelegram(body.telegramId, user?.userId);
  }

  private matchesSecret(candidate: string): boolean {
    let expected: string;
    try {
      expected = this.bot.getWebhookSecret();
    } catch {
      throw new ServiceUnavailableException('Telegram webhook is not configured');
    }
    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramLoginService } from './telegram-login.service';

@Module({
  imports: [PassportModule],
  controllers: [TelegramBotController],
  providers: [TelegramBotService, TelegramLoginService],
  exports: [TelegramBotService, TelegramLoginService],
})
export class TelegramBotModule {}

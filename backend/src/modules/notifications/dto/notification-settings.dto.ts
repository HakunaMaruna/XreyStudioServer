// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsObject, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

  @IsOptional()
  @IsObject()
  policy?: {
    enabled?: boolean;
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
    cooldownMinutes?: number;
    minSeverity?: string;
    escalationChannel?: string | null;
    infoIntervalMinutes?: number;
    errorRepeatMinutes?: number;
    cheburcheckIntervalMinutes?: number;
  };
}

export class TestNotificationDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  channel?: string;
}

export class DeliveryQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  limit?: string;
}

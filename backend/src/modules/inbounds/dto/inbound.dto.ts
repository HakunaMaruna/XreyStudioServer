// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export const RESET_SCHEDULES = ['never', 'hourly', 'daily', 'weekly', 'monthly'] as const;

export class FallbackDto {
  @IsString() childId: string;
  @IsOptional() @IsString() path?: string;
  @IsOptional() @IsString() alpn?: string;
  @IsOptional() @IsString() dest?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1) xver?: number;
}

export class ClientLimitDto {
  @IsString() userId: string;
  @IsOptional() @IsInt() @Min(0) trafficLimit?: number;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() comment?: string;
  @IsOptional() @IsInt() sortIndex?: number;
}

export class CreateInboundDto {
  @IsString()
  tag: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  protocol: string;

  @IsOptional()
  @IsString()
  transport?: string;

  @IsOptional()
  @IsString()
  security?: string;

  @IsInt()
  port: number;

  @IsOptional()
  @IsString()
  listen?: string;

  @IsOptional()
  @IsString()
  flow?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsString()
  sni?: string;

  @IsOptional()
  @IsString()
  serviceName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  trafficLimit?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsIn(RESET_SCHEDULES)
  resetSchedule?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  resetDay?: number;

  @IsObject()
  settings: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FallbackDto)
  fallbacks?: FallbackDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ClientLimitDto)
  clients?: ClientLimitDto[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateInboundDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  protocol?: string;

  @IsOptional()
  @IsString()
  transport?: string;

  @IsOptional()
  @IsString()
  security?: string;

  @IsOptional()
  @IsInt()
  port?: number;

  @IsOptional()
  @IsString()
  listen?: string;

  @IsOptional()
  @IsString()
  flow?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsString()
  sni?: string;

  @IsOptional()
  @IsString()
  serviceName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  trafficLimit?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsIn(RESET_SCHEDULES)
  resetSchedule?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  resetDay?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FallbackDto)
  fallbacks?: FallbackDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ClientLimitDto)
  clients?: ClientLimitDto[];

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}


export class BulkInboundUsersDto {
  @IsIn(['add', 'remove'])
  mode: 'add' | 'remove';

  @IsIn(['selected', 'all', 'squad'])
  scope: 'selected' | 'all' | 'squad';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsUUID('4')
  squadId?: string;
}

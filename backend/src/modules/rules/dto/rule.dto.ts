// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  inboundId?: string | null;

  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsString()
  recipe?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  organizationId?: string | null;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  inboundId?: string | null;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  recipe?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  organizationId?: string | null;
}

export class ValidateRuleDto {
  @IsObject()
  payload: Record<string, unknown>;
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateHostDto {
  @IsString()
  address: string;

  @IsInt()
  port: number;

  @IsOptional()
  @IsString()
  sni?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsString()
  recipe?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateHostDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsInt()
  port?: number;

  @IsOptional()
  @IsString()
  sni?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsString()
  recipe?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ApplyHostDto {
  @IsString()
  inboundId: string;
}

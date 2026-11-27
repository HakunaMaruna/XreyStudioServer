// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  userId: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  planId?: string;
}

export class CreatePlanDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsInt()
  price: number;

  @IsInt()
  @IsPositive()
  trafficGb: number;

  @IsInt()
  @IsPositive()
  durationDays: number;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  price?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  trafficGb?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  durationDays?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

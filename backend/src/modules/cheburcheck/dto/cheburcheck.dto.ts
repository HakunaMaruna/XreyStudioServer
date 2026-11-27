// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsOptional, IsString, Matches } from 'class-validator';

export class CheburcheckCheckDto {
  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._:\-/]+$/)
  target?: string;
}

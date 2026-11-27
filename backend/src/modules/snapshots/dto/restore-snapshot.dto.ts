// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsArray, IsBoolean, IsIn, IsOptional } from 'class-validator';

export type RestoreComponent = 'db' | 'settings';

export class RestoreSnapshotDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(['db', 'settings'], { each: true })
  components?: RestoreComponent[];
}

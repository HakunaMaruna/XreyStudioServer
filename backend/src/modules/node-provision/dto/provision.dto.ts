// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ProvisionNodeDto {
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/)
  name: string;

  @Matches(/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/)
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @Matches(/^[a-z_][a-z0-9_-]{0,31}$/)
  username: string;

  @IsOptional()
  @IsString()
  @MaxLength(16384)
  privateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  passphrase?: string;

  @IsOptional()
  useSudo?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password?: string;

  @IsOptional()
  @Matches(/^SHA256:[A-Za-z0-9+/]{43}=?$/)
  hostKeyFingerprint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  jumpNodeId?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  location?: string;

  @IsOptional()
  @Matches(/^https:\/\/[A-Za-z0-9.-]+(?::\d{2,5})?(?:\/[A-Za-z0-9._~/-]*)?$/)
  @MaxLength(500)
  panelUrl?: string;
}

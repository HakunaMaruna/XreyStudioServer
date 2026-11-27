// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class UpdateWizardNodeDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(253) address?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) location?: string;

  @IsOptional() @IsIn(['password', 'password_key', 'key']) authMode?: 'password' | 'password_key' | 'key';
  @IsOptional() @IsString() @MaxLength(128) sshUser?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) sshPort?: number;
  @IsOptional() @Matches(/^(\d{1,3}\.){3}\d{1,3}$/) ipv4?: string;
  @IsOptional() @Matches(/^[0-9a-fA-F:]+$/) ipv6?: string;
  @IsOptional() @IsString() @MaxLength(253) userDomain?: string;

  // Пустое значение = оставить существующий секрет; новое = заменить.
  @IsOptional() @IsString() @MaxLength(256) password?: string;
  @IsOptional() @IsString() @MaxLength(16384) privateKey?: string;
  @IsOptional() @IsString() @MaxLength(256) passphrase?: string;
}

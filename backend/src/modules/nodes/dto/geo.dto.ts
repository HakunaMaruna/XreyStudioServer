// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class NodeGeoDto {
  @IsOptional() @IsString() @MaxLength(128) ip?: string;
  @IsOptional() @IsString() @MaxLength(8) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(128) city?: string;
  @IsOptional() @IsString() @MaxLength(64) asn?: string;
  @IsOptional() @IsString() @MaxLength(256) org?: string;
}

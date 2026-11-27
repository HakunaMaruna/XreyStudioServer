// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateReverseDto {
  @IsString() @MaxLength(120) name: string;
  @IsString() nodeId: string;
  @IsString() portalInboundId: string;
  @IsInt() @Min(1) @Max(65535) publicPort: number;
  @IsOptional() @IsString() @MaxLength(253) internalAddress?: string;
  @IsInt() @Min(1) @Max(65535) internalPort: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() organizationId?: string | null;
}

export class UpdateReverseDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(65535) publicPort?: number;
  @IsOptional() @IsString() @MaxLength(253) internalAddress?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) internalPort?: number;
}

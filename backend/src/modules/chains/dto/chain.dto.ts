// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChainExitDto {
  @IsString()
  @MaxLength(64)
  nodeId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(32)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreateChainDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(64)
  entryNodeId: string;

  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => ChainExitDto)
  exits: ChainExitDto[];

  @IsOptional()
  @IsIn(['all', 'rules'])
  routingMode?: 'all' | 'rules';

  @IsOptional()
  @IsIn(['auto', 'direct', 'bridge'])
  bridgeMode?: 'auto' | 'direct' | 'bridge';

  @IsOptional()
  @IsString()
  organizationId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  routingRules?: Record<string, unknown>[];
}

export class UpdateChainDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';

  @IsOptional()
  @IsIn(['all', 'rules'])
  routingMode?: 'all' | 'rules';

  @IsOptional()
  @IsIn(['auto', 'direct', 'bridge'])
  bridgeMode?: 'auto' | 'direct' | 'bridge';

  @IsOptional()
  @IsString()
  organizationId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => ChainExitDto)
  exits?: ChainExitDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  routingRules?: Record<string, unknown>[];
}

export class BindChainDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  squadId?: string;
}

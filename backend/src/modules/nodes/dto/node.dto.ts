// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateNodeDto {
  @IsString()
  name: string;

  @Matches(/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?|\d{1,3}(?:\.\d{1,3}){3})$/, { message: 'invalid node address' })
  address: string;

  @IsOptional()
  @IsInt()
  port?: number;

  @IsOptional()
  @Matches(/^https?:\/\//i, { message: 'agentUrl must use http or https' })
  @MaxLength(512)
  agentUrl?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  location?: string;
}

export class UpdateNodeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsInt()
  port?: number;

  @IsOptional()
  @IsString()
  agentUrl?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  location?: string;
}

export class RegisterNodeDto {
  @IsString()
  nodeId: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  xrayVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentVersion?: string;
}

export class NodeMetricsDto {
  @IsOptional()
  @IsNumber()
  cpu?: number;

  @IsOptional()
  @IsNumber()
  ram?: number;

  @IsOptional()
  @IsNumber()
  disk?: number;

  @IsOptional()
  @IsNumber()
  trafficUp?: number;

  @IsOptional()
  @IsNumber()
  trafficDown?: number;

  @IsOptional()
  @IsInt()
  connections?: number;

  @IsOptional()
  @IsString()
  xray?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentVersion?: string;
}

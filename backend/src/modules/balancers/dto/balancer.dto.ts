// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional,
  IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';

export class BalancerMemberDto {
  @IsOptional() @IsString() id?: string;

  @IsIn(['vless', 'vmess', 'trojan', 'shadowsocks', 'freedom', 'socks', 'http'])
  protocol: string;

  @IsOptional() @IsString() @MaxLength(253) address?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsString() @MaxLength(128) uuid?: string;
  @IsOptional() @IsString() @MaxLength(256) password?: string;
  @IsOptional() @IsString() @MaxLength(64) method?: string;
  @IsOptional() @IsIn(['none', 'tls', 'reality']) security?: string;
  @IsOptional() @IsString() @MaxLength(64) transport?: string;
  @IsOptional() @IsString() @MaxLength(253) sni?: string;
  @IsOptional() @IsString() @MaxLength(512) path?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{20,64}$/, { message: 'REALITY publicKey must be base64url' }) publicKey?: string;
  @IsOptional() @IsString() @Matches(/^[0-9a-fA-F]{0,16}$/, { message: 'REALITY shortId must be up to 16 hex chars' }) shortId?: string;
  @IsOptional() @IsString() @MaxLength(32) fingerprint?: string;
  @IsOptional() @IsIn(['', 'xtls-rprx-vision']) flow?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class CreateBalancerDto {
  @IsOptional() @IsIn(['observatory', 'burstObservatory']) observatoryMode?: string;
  @IsOptional() @IsString() @MaxLength(512) burstDestination?: string;
  @IsOptional() @IsInt() @Min(10) @Max(3600) burstIntervalSec?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) burstSampling?: number;
  @IsOptional() @IsInt() @Min(1) @Max(60) burstTimeoutSec?: number;
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsIn(['random', 'roundRobin', 'leastPing', 'leastLoad']) strategy?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(80) fallbackTag?: string;
  @IsOptional() @IsString() @MaxLength(512) probeUrl?: string;
  @IsOptional() @IsInt() @Min(10) @Max(3600) probeIntervalSec?: number;
  @IsOptional() @IsObject() rule?: Record<string, unknown>;
  @IsArray() @ArrayMaxSize(32) members: BalancerMemberDto[];
  @IsOptional() @IsString() organizationId?: string | null;
}

export class UpdateBalancerDto {
  @IsOptional() @IsIn(['observatory', 'burstObservatory']) observatoryMode?: string;
  @IsOptional() @IsString() @MaxLength(512) burstDestination?: string;
  @IsOptional() @IsInt() @Min(10) @Max(3600) burstIntervalSec?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) burstSampling?: number;
  @IsOptional() @IsInt() @Min(1) @Max(60) burstTimeoutSec?: number;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['random', 'roundRobin', 'leastPing', 'leastLoad']) strategy?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(80) fallbackTag?: string;
  @IsOptional() @IsString() @MaxLength(512) probeUrl?: string;
  @IsOptional() @IsInt() @Min(10) @Max(3600) probeIntervalSec?: number;
  @IsOptional() @IsObject() rule?: Record<string, unknown>;
  @IsArray() @ArrayMaxSize(32) members?: BalancerMemberDto[];
  @IsOptional() @IsString() organizationId?: string | null;
}

export class ValidateBalancerDto {
  @IsObject()
  balancer: Record<string, unknown>;
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { IsOptional, IsString } from 'class-validator';

export class AllocateDomainDto {
  @IsString()
  ipv4: string;

  @IsOptional()
  @IsString()
  ipv6?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  nodeName?: string;
}

export class BindDomainDto {
  @IsString()
  nodeId: string;
}

export class IssueCertificateDto {
  @IsString()
  domainId: string;
}

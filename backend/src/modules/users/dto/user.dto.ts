// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  Min,
  Max,
  IsDateString,
  IsIn,
  Matches,
} from 'class-validator';
import { Role, UserStatus } from '@prisma/client';

export class CreateUserDto {
  @IsOptional()
  @Matches(/^[0-9]{5,12}$/, { message: 'telegramId must contain 5-12 digits' })
  telegramId?: string;

  @IsEmail({}, { message: 'Укажите корректный email' })
  email: string;

  // Пароль нужен только для входа в панель; VPN-клиент работает по ссылке подписки.
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  trafficLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  deviceLimit?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @Matches(/^[0-9]{5,12}$/, { message: 'telegramId must contain 5-12 digits' })
  telegramId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  trafficLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  deviceLimit?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  configProfileId?: string;

  @IsOptional()
  @IsString()
  subscriptionTemplateId?: string;

  @IsOptional()
  @IsString()
  squadId?: string;
}

export class UsersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;

  @IsOptional()
  @IsIn(['email', 'role', 'status', 'trafficLimit', 'trafficUsed', 'expiresAt', 'createdAt'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

export class BulkUsersDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  ids: string[];

  @IsIn(['disable', 'enable', 'delete', 'resetTraffic'])
  action: 'disable' | 'enable' | 'delete' | 'resetTraffic';
}

import { IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export const RESET_SCHEDULES = ['never', 'hourly', 'daily', 'weekly', 'monthly'] as const;

export class CreateInboundDto {
  @IsString()
  tag: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  protocol: string;

  @IsOptional()
  @IsString()
  transport?: string;

  @IsOptional()
  @IsString()
  security?: string;

  @IsInt()
  port: number;

  @IsOptional()
  @IsString()
  listen?: string;

  @IsOptional()
  @IsString()
  flow?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsString()
  sni?: string;

  @IsOptional()
  @IsString()
  serviceName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  trafficLimit?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsIn(RESET_SCHEDULES)
  resetSchedule?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  resetDay?: number;

  @IsObject()
  settings: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateInboundDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  protocol?: string;

  @IsOptional()
  @IsString()
  transport?: string;

  @IsOptional()
  @IsString()
  security?: string;

  @IsOptional()
  @IsInt()
  port?: number;

  @IsOptional()
  @IsString()
  listen?: string;

  @IsOptional()
  @IsString()
  flow?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsString()
  sni?: string;

  @IsOptional()
  @IsString()
  serviceName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  trafficLimit?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsIn(RESET_SCHEDULES)
  resetSchedule?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  resetDay?: number;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

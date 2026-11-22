import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateNodeDto {
  @IsString()
  name: string;

  @IsString()
  address: string;

  @IsOptional()
  @IsInt()
  port?: number;

  @IsOptional()
  @IsString()
  agentUrl?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;
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
}

export class UserTrafficDto {
  @IsString()
  email: string;

  @IsNumber()
  uplink: number;

  @IsNumber()
  downlink: number;
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
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => UserTrafficDto)
  users?: UserTrafficDto[];
}

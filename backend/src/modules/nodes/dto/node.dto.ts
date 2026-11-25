import { IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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

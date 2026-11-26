import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ValidateRoutingDto {
  @IsObject()
  payload: Record<string, unknown>;
}

export class CreateRoutingDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  inboundId?: string | null;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsString()
  recipe?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  organizationId?: string | null;
}

export class UpdateRoutingDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  inboundId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  recipe?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  organizationId?: string | null;
}

import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateRuleDto {
  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsString()
  recipe?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  organizationId?: string | null;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  recipe?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  organizationId?: string | null;
}

export class ValidateRuleDto {
  @IsObject()
  payload: Record<string, unknown>;
}

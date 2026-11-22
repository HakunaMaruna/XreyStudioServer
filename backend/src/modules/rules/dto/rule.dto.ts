import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateRuleDto {
  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
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
  @IsBoolean()
  enabled?: boolean;
}

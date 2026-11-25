import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

const NAME_PATTERN = /^[\p{L}\p{N} ._-]{1,120}$/u;

export class CreateConfigProfileDto {
  @Matches(NAME_PATTERN)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsObject()
  payload: object;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  nodeId?: string;

  // Задаёт только ADMIN; OPERATOR всегда получает свою организацию.
  @IsOptional()
  @IsString()
  organizationId?: string | null;
}

export class UpdateConfigProfileDto {
  @IsOptional()
  @Matches(NAME_PATTERN)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsObject()
  payload?: object;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  nodeId?: string;

  @IsOptional()
  @IsString()
  organizationId?: string | null;
}

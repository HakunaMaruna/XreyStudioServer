import {
  IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

class ValidateDnsDto {
  @IsOptional() @IsObject() hosts?: Record<string, unknown>;
  @IsArray() servers: unknown[];
  @IsOptional() @IsObject() options?: Record<string, unknown>;
}

export class ValidateDnsProfileDto {
  @IsObject() payload: ValidateDnsDto;
}

export class CreateDnsProfileDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(-100) @Max(100) priority?: number;
  @IsOptional() @IsObject() hosts?: Record<string, unknown>;
  @IsArray() servers: unknown[];
  @IsOptional() @IsObject() options?: Record<string, unknown>;
  @IsOptional() @IsString() recipe?: string;
  @IsOptional() @IsString() organizationId?: string | null;
}

export class UpdateDnsProfileDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(-100) @Max(100) priority?: number;
  @IsOptional() @IsObject() hosts?: Record<string, unknown>;
  @IsOptional() @IsArray() servers?: unknown[];
  @IsOptional() @IsObject() options?: Record<string, unknown>;
  @IsOptional() @IsString() recipe?: string;
  @IsOptional() @IsString() organizationId?: string | null;
}

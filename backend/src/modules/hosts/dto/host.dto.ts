import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateHostDto {
  @IsString()
  address: string;

  @IsInt()
  port: number;

  @IsOptional()
  @IsString()
  sni?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateHostDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsInt()
  port?: number;

  @IsOptional()
  @IsString()
  sni?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

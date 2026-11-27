import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateNodeAgentDto {
  @Matches(/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/)
  host: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @Matches(/^[a-z_][a-z0-9_-]{0,31}$/)
  username: string;

  @IsOptional()
  @IsString()
  @MaxLength(16384)
  privateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  passphrase?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password?: string;

  @IsOptional()
  useSudo?: boolean;

  @IsOptional()
  @Matches(/^SHA256:[A-Za-z0-9+/]{43}=?$/)
  hostKeyFingerprint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  jumpNodeId?: string;

  @IsOptional()
  @Matches(/^\/[A-Za-z0-9._/-]{1,200}$/)
  repoDir?: string;

  @IsOptional()
  @Matches(/^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?$/)
  @MaxLength(64)
  targetVersion?: string;
}

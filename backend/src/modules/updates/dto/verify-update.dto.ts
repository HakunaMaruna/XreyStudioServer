import { IsBase64, IsOptional, Matches, MaxLength } from 'class-validator';

export class VerifyUpdateDto {
  @IsBase64()
  @MaxLength(80_000_000)
  bundleBase64: string;

  @IsBase64()
  @MaxLength(4096)
  signatureBase64: string;

  @IsOptional()
  @Matches(/^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?$/)
  @MaxLength(64)
  version?: string;
}

import { IsOptional, Matches, MaxLength } from 'class-validator';

export class ApplyUpdateDto {
  @IsOptional()
  @Matches(/^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?$/)
  @MaxLength(64)
  targetVersion?: string;
}

import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class SnapshotPolicyDto {
  @IsOptional()
  @IsBoolean()
  autoBeforeUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  autoBeforeSettings?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  retention?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  cooldownMinutes?: number;
}

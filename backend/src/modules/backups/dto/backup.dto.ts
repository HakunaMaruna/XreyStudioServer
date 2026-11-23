import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RestoreBackupDto {
  @IsBoolean()
  confirm: boolean;
}

export class UpdateBackupSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  intervalHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  retention?: number;
}

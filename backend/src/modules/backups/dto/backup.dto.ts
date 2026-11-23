import { IsBoolean } from 'class-validator';

export class RestoreBackupDto {
  @IsBoolean()
  confirm: boolean;
}

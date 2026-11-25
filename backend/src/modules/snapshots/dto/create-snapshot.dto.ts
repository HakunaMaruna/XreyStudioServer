import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SnapshotScope } from '@prisma/client';

export class CreateSnapshotDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsIn([SnapshotScope.FULL, SnapshotScope.SETTINGS])
  scope?: SnapshotScope;
}

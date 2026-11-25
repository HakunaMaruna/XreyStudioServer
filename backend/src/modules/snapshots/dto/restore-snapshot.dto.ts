import { IsArray, IsBoolean, IsIn, IsOptional } from 'class-validator';

export type RestoreComponent = 'db' | 'settings';

export class RestoreSnapshotDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(['db', 'settings'], { each: true })
  components?: RestoreComponent[];
}

import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class TrafficEntryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  subscriptionToken?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  up?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  down?: number;
}

export class TrafficReportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrafficEntryDto)
  entries: TrafficEntryDto[];

  @IsOptional()
  @IsString()
  period?: string;
}

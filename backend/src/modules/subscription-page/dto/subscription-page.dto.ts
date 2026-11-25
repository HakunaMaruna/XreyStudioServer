import {
  IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

export class UpdatePageSettingsDto {
  @IsOptional() @IsString() @MaxLength(2000) brand?: string;
  @IsOptional() @IsString() @MaxLength(2000) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(2000) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) faviconUrl?: string;
  @IsOptional() @IsString() @MaxLength(32) accent?: string;
  @IsOptional() @IsString() @MaxLength(32) background?: string;
  @IsOptional() @IsIn(['auto', 'dark', 'light']) defaultTheme?: string;
  @IsOptional() @IsString() @MaxLength(20000) customCss?: string;
  @IsOptional() @IsObject() blocks?: Record<string, boolean>;
  @IsOptional() @IsObject() support?: { telegram?: string; website?: string; email?: string };
  @IsOptional() @IsString() @MaxLength(2000) announcement?: string;
  @IsOptional() @IsIn(['ru', 'en']) defaultLanguage?: string;
}

export class VpnAppDto {
  @IsString() @MaxLength(120) name: string;
  @IsIn(['android', 'ios', 'windows', 'macos', 'linux', 'android-tv', 'all']) platform: string;
  @IsOptional() @IsString() @MaxLength(2000) iconUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) downloadUrl?: string;
  @IsOptional() @IsString() @MaxLength(1024) deepLinkTemplate?: string;
  @IsOptional() @IsObject() instructions?: Record<string, string>;
  @IsOptional() @IsInt() @Min(-1000) @Max(1000) sortOrder?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateVpnAppDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['android', 'ios', 'windows', 'macos', 'linux', 'android-tv', 'all']) platform?: string;
  @IsOptional() @IsString() @MaxLength(2000) iconUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) downloadUrl?: string;
  @IsOptional() @IsString() @MaxLength(1024) deepLinkTemplate?: string;
  @IsOptional() @IsObject() instructions?: Record<string, string>;
  @IsOptional() @IsInt() @Min(-1000) @Max(1000) sortOrder?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

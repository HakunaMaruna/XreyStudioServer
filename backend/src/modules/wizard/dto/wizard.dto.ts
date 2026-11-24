import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const FQDN = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export class CreateNodeWizardDto {
  @Matches(/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/, { message: 'invalid host' })
  host: string;

  @IsOptional()
  @Matches(/^[A-Za-z_][A-Za-z0-9._-]*$/, { message: 'invalid SSH user' })
  sshUser?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  sshPort?: number;

  @IsIn(['password', 'password_key', 'key'])
  authMode: 'password' | 'password_key' | 'key';

  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16384)
  privateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  passphrase?: string;

  @Matches(/^SHA256:[A-Za-z0-9+/]{43}=?$/, { message: 'invalid SSH host key fingerprint' })
  hostKeyFingerprint: string;

  @Matches(/^[A-Z]{2}$/, { message: 'location must be an ISO alpha-2 country code' })
  location: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nodeName?: string;

  @IsOptional()
  @Matches(/^(\d{1,3}\.){3}\d{1,3}$/, { message: 'invalid IPv4 address' })
  ipv4?: string;

  @IsOptional()
  @Matches(/^[0-9a-fA-F:]+$/, { message: 'invalid IPv6 address' })
  ipv6?: string;

  @IsOptional()
  @Matches(FQDN, { message: 'userDomain must be a valid FQDN' })
  userDomain?: string;
}

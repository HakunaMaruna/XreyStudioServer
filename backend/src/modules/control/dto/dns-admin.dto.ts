import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min,
} from 'class-validator';

export class CreateZoneDto {
  @IsString()
  @Matches(/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}\.?$/)
  name: string;

  @IsOptional() @IsString() ns1?: string;
  @IsOptional() @IsString() ns2?: string;
}

export class RecordInput {
  @IsString() content: string;
  @IsOptional() disabled?: boolean;
}

export class SetRecordDto {
  @IsString()
  name: string;

  @IsIn(['A', 'AAAA', 'CNAME', 'TXT', 'NS', 'MX', 'SRV', 'PTR'])
  type: string;

  @IsInt() @Min(30) @Max(86400) ttl: number;

  @IsArray()
  records: RecordInput[];
}

export class SetDnssecDto {
  @IsBoolean()
  enabled: boolean;
}

export class CreateDnssecKeyDto {
  @IsIn(['ksk', 'zsk', 'csk'])
  keytype: 'ksk' | 'zsk' | 'csk';

  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsString() algorithm?: string;
  @IsOptional() @IsInt() @Min(512) @Max(4096) bits?: number;
}

export class UpdateDnssecKeyDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() published?: boolean;
}

export class UpdateDnsSettingsDto {
  @IsOptional() @IsString() PDNS_API_URL?: string;
  @IsOptional() @IsString() PDNS_API_KEY?: string;
  @IsOptional() @IsString() NODE_DNS_ZONE?: string;
  @IsOptional() @IsInt() @Min(30) @Max(86400) NODE_DNS_TTL?: number;
  @IsOptional() @IsString() DNS_NS1?: string;
  @IsOptional() @IsString() DNS_NS2?: string;
  @IsOptional() @IsString() PDNS_BIND_IP?: string;
}

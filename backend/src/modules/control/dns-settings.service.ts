// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, Injectable } from '@nestjs/common';
import { decryptSecret, encryptSecret } from '../../common/secret-crypto';
import { PrismaService } from '../../prisma/prisma.service';

const KEYS = [
  'PDNS_API_URL',
  'PDNS_API_KEY',
  'NODE_DNS_ZONE',
  'NODE_DNS_TTL',
  'DNS_NS1',
  'DNS_NS2',
  'PDNS_BIND_IP',
] as const;

export type DnsSettingsPatch = Partial<{
  PDNS_API_URL: string;
  PDNS_API_KEY: string;
  NODE_DNS_ZONE: string;
  NODE_DNS_TTL: number;
  DNS_NS1: string;
  DNS_NS2: string;
  PDNS_BIND_IP: string;
}>;

@Injectable()
export class DnsSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  mode(): 'control' | 'tenant' {
    return process.env.PANEL_MODE === 'control' ? 'control' : 'tenant';
  }

  async value(key: (typeof KEYS)[number]): Promise<string | undefined> {
    const row = await this.prisma.dnsSetting.findUnique({ where: { key } });
    if (row) {
      if (key === 'PDNS_API_KEY') {
        try { return decryptSecret(row.value); } catch { return undefined; }
      }
      return row.value;
    }
    return process.env[key] || undefined;
  }

  async config() {
    return {
      apiUrl: (await this.value('PDNS_API_URL')) || 'http://powerdns:8081',
      apiKey: (await this.value('PDNS_API_KEY')) || '',
      zone: (await this.value('NODE_DNS_ZONE')) || 'node.h2onetwork.pro',
      ttl: Number(await this.value('NODE_DNS_TTL')) || 60,
      ns1: (await this.value('DNS_NS1')) || 'ns1.h2onetwork.pro.',
      ns2: (await this.value('DNS_NS2')) || 'ns2.h2onetwork.pro.',
      bindIp: (await this.value('PDNS_BIND_IP')) || '0.0.0.0',
      mode: this.mode(),
    };
  }

  // Секреты не возвращаются в API — только признак наличия.
  async publicSettings() {
    const config = await this.config();
    return {
      mode: config.mode,
      apiUrl: config.apiUrl,
      zone: config.zone,
      ttl: config.ttl,
      ns1: config.ns1,
      ns2: config.ns2,
      bindIp: config.bindIp,
      apiKeyConfigured: Boolean(config.apiKey),
    };
  }

  async update(patch: DnsSettingsPatch) {
    if (patch.NODE_DNS_ZONE && !/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(patch.NODE_DNS_ZONE)) {
      throw new BadRequestException('Invalid DNS zone');
    }
    if (patch.NODE_DNS_TTL !== undefined && (patch.NODE_DNS_TTL < 30 || patch.NODE_DNS_TTL > 86400)) {
      throw new BadRequestException('TTL must be between 30 and 86400');
    }
    if (patch.PDNS_API_URL) {
      let url: URL;
      try { url = new URL(patch.PDNS_API_URL); } catch { throw new BadRequestException('Invalid PowerDNS API URL'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('API URL must use http or https');
    }
    for (const [key, value] of Object.entries(patch)) {
      if (!KEYS.includes(key as (typeof KEYS)[number]) || value === undefined) continue;
      const stored = key === 'PDNS_API_KEY' ? (value ? encryptSecret(String(value)) : '') : String(value);
      if (!value) {
        await this.prisma.dnsSetting.deleteMany({ where: { key } });
      } else {
        await this.prisma.dnsSetting.upsert({
          where: { key },
          create: { key, value: stored },
          update: { value: stored },
        });
      }
    }
    return this.publicSettings();
  }
}

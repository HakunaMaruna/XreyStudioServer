import { ForbiddenException, Injectable } from '@nestjs/common';
import { DnsSettingsService } from './dns-settings.service';
import { PowerDnsService, Rrset } from './powerdns.service';

@Injectable()
export class DnsAdminService {
  constructor(
    private readonly dns: PowerDnsService,
    private readonly settings: DnsSettingsService,
  ) {}

  private assertControl() {
    if (this.settings.mode() !== 'control') {
      throw new ForbiddenException('DNS is available only in CONTROL mode');
    }
  }

  async status() {
    const config = await this.settings.config();
    const base = {
      mode: config.mode,
      zone: config.zone,
      ttl: config.ttl,
      apiUrl: config.apiUrl,
      apiKeyConfigured: Boolean(config.apiKey),
      bindIp: config.bindIp,
    };
    if (config.mode !== 'control') return { ...base, available: false };
    try {
      const [server, zones, stats, metrics] = await Promise.all([
        this.dns.serverInfo(),
        this.dns.zones(),
        this.dns.statistics(),
        this.dns.metrics(),
      ]);
      const stat = (name: string) => {
        const row = (stats as any[]).find((item) => item.name === name);
        return row ? Number(row.value) : 0;
      };
      return {
        ...base,
        available: true,
        version: (server as any).version || null,
        daemonType: (server as any).daemon_type || null,
        zones: (zones as any[]).length,
        queries: stat('udp-queries') + stat('tcp-queries'),
        answers: stat('udp-answers') + stat('tcp-answers'),
        servfail: stat('servfail-packets'),
        uptime: Number(metrics.pdns_auth_uptime || 0),
        latency: Number(metrics.pdns_auth_latency || 0),
        metrics,
      };
    } catch (error: any) {
      return { ...base, available: false, error: error.message };
    }
  }

  async zones() {
    this.assertControl();
    const zones = await this.dns.zones();
    const config = await this.settings.config();
    return (zones as any[]).map((zone) => ({
      id: zone.id,
      name: zone.name,
      kind: zone.kind,
      serial: zone.serial,
      records: Array.isArray(zone.rrsets) ? zone.rrsets.length : undefined,
      managed: zone.name?.toLowerCase().replace(/\.$/, '') === config.zone.toLowerCase().replace(/\.$/, ''),
    }));
  }

  async records(zone: string) {
    this.assertControl();
    const detail: any = await this.dns.zone(zone);
    const rows: Array<{ name: string; type: string; ttl: number; content: string; disabled: boolean }> = [];
    for (const rrset of detail.rrsets || []) {
      for (const record of rrset.records || []) {
        rows.push({
          name: rrset.name,
          type: rrset.type,
          ttl: rrset.ttl,
          content: record.content,
          disabled: Boolean(record.disabled),
        });
      }
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
  }

  async setRecord(zone: string, body: { name: string; type: string; ttl: number; records: Array<{ content: string; disabled?: boolean }> }) {
    this.assertControl();
    const rrset: Rrset = {
      name: body.name.endsWith('.') ? body.name : `${body.name}.`,
      type: body.type,
      ttl: body.ttl,
      changetype: 'REPLACE',
      records: body.records.map((record) => ({ content: record.content, disabled: Boolean(record.disabled) })),
    };
    await this.dns.patchRrsets(zone, [rrset]);
    return { saved: true };
  }

  async deleteRecord(zone: string, name: string, type: string) {
    this.assertControl();
    await this.dns.patchRrsets(zone, [{
      name: name.endsWith('.') ? name : `${name}.`,
      type,
      ttl: 60,
      changetype: 'DELETE',
      records: [],
    }]);
    return { deleted: true };
  }

  createZone(dto: { name: string; ns1?: string; ns2?: string }) {
    this.assertControl();
    return this.dns.createZone(dto.name, dto.ns1 || 'ns1.h2onetwork.pro.', dto.ns2 || 'ns2.h2onetwork.pro.');
  }

  deleteZone(name: string) {
    this.assertControl();
    return this.dns.deleteZone(name);
  }

  getSettings() {
    this.assertControl();
    return this.settings.publicSettings();
  }

  updateSettings(patch: Record<string, unknown>) {
    this.assertControl();
    return this.settings.update(patch as any);
  }
}

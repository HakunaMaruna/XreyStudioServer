import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DnsSettingsService } from './dns-settings.service';

export type Rrset = {
  name: string;
  type: string;
  ttl: number;
  changetype: 'REPLACE' | 'DELETE';
  records: Array<{ content: string; disabled: boolean }>;
};

@Injectable()
export class PowerDnsService {
  private readonly logger = new Logger(PowerDnsService.name);

  constructor(private readonly settings: DnsSettingsService) {}

  private async config() {
    return this.settings.config();
  }

  private fqdn(label: string, zone: string) {
    return `${label}.${zone}.`.toLowerCase();
  }

  private async request(path: string, init: RequestInit = {}) {
    const { apiUrl, apiKey } = await this.config();
    if (!apiKey) throw new BadRequestException('PowerDNS API key is not configured');
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      throw new BadRequestException(`PowerDNS API error ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return response;
  }

  private async patch(rrsets: Rrset[]) {
    const { zone } = await this.config();
    await this.request(`/api/v1/servers/localhost/zones/${encodeURIComponent(zone)}`, {
      method: 'PATCH',
      body: JSON.stringify({ rrsets }),
    });
  }

  async setAddress(label: string, ipv4: string, ipv6?: string | null) {
    const { zone, ttl } = await this.config();
    const sets: Rrset[] = [
      { name: this.fqdn(label, zone), type: 'A', ttl, changetype: 'REPLACE', records: [{ content: ipv4, disabled: false }] },
    ];
    if (ipv6) {
      sets.push({ name: this.fqdn(label, zone), type: 'AAAA', ttl, changetype: 'REPLACE', records: [{ content: ipv6, disabled: false }] });
    }
    await this.patch(sets);
  }

  async setTxt(label: string, value: string) {
    const { zone } = await this.config();
    await this.patch([
      {
        name: this.fqdn(label, zone),
        type: 'TXT',
        ttl: 60,
        changetype: 'REPLACE',
        records: [{ content: `"${value}"`, disabled: false }],
      },
    ]);
  }

  async removeTxt(label: string) {
    const { zone } = await this.config();
    await this.patch([{ name: this.fqdn(label, zone), type: 'TXT', ttl: 60, changetype: 'DELETE', records: [] }]);
  }

  async remove(label: string) {
    const { zone, ttl } = await this.config();
    await this.patch([
      { name: this.fqdn(label, zone), type: 'A', ttl, changetype: 'DELETE', records: [] },
      { name: this.fqdn(label, zone), type: 'AAAA', ttl, changetype: 'DELETE', records: [] },
      { name: this.fqdn(label, zone), type: 'TXT', ttl: 60, changetype: 'DELETE', records: [] },
    ]);
  }

  async zoneName() {
    return (await this.config()).zone;
  }

  async isConfigured() {
    return Boolean((await this.config()).apiKey);
  }

  async apiUrl() {
    return (await this.config()).apiUrl;
  }

  async apiKey() {
    return (await this.config()).apiKey;
  }

  async serverInfo() {
    const response = await this.request('/api/v1/servers/localhost');
    return response.json();
  }

  async zones() {
    const response = await this.request('/api/v1/servers/localhost/zones');
    return response.json();
  }

  async statistics() {
    const response = await this.request('/api/v1/servers/localhost/statistics');
    return response.json();
  }

  async metrics() {
    const response = await this.request('/metrics', { headers: { Accept: 'text/plain' } });
    const text = await response.text();
    const result: Record<string, number> = {};
    for (const line of text.split('\n')) {
      const match = /^(pdns_auth_[a-z0-9_]+)\s+([0-9.]+)$/.exec(line.trim());
      if (match) result[match[1]] = Number(match[2]);
    }
    return result;
  }

  async zone(id: string) {
    const response = await this.request(`/api/v1/servers/localhost/zones/${encodeURIComponent(id)}`);
    return response.json();
  }

  async createZone(name: string, ns1: string, ns2: string) {
    const zone = name.endsWith('.') ? name : `${name}.`;
    const response = await this.request('/api/v1/servers/localhost/zones', {
      method: 'POST',
      body: JSON.stringify({ name: zone, kind: 'Native', nameservers: [ns1, ns2] }),
    });
    return response.json();
  }

  async deleteZone(name: string) {
    await this.request(`/api/v1/servers/localhost/zones/${encodeURIComponent(name)}`, { method: 'DELETE' });
    return { deleted: name };
  }

  // DNSSEC: бумажные ключи и подпись зоны через Cryptokeys API.
  async cryptokeys(zone: string) {
    const response = await this.request(`/api/v1/servers/localhost/zones/${encodeURIComponent(zone)}/cryptokeys`);
    return response.json();
  }

  async createCryptokey(zone: string, body: {
    keytype: 'ksk' | 'zsk' | 'csk';
    active?: boolean;
    published?: boolean;
    algorithm?: string;
    bits?: number;
  }) {
    const response = await this.request(`/api/v1/servers/localhost/zones/${encodeURIComponent(zone)}/cryptokeys`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async updateCryptokey(zone: string, id: number | string, body: { active?: boolean; published?: boolean }) {
    await this.request(`/api/v1/servers/localhost/zones/${encodeURIComponent(zone)}/cryptokeys/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return { updated: id };
  }

  async deleteCryptokey(zone: string, id: number | string) {
    await this.request(`/api/v1/servers/localhost/zones/${encodeURIComponent(zone)}/cryptokeys/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
    });
    return { deleted: id };
  }

  async setDnssec(zone: string, enabled: boolean) {
    const response = await this.request(`/api/v1/servers/localhost/zones/${encodeURIComponent(zone)}`, {
      method: 'PATCH',
      body: JSON.stringify({ dnssec: enabled, ...(enabled ? { api_rectify: true } : {}) }),
    });
    return response.json().catch(() => ({ ok: true }));
  }

  async patchRrsets(zone: string, rrsets: Rrset[]) {
    const response = await this.request(`/api/v1/servers/localhost/zones/${encodeURIComponent(zone)}`, {
      method: 'PATCH',
      body: JSON.stringify({ rrsets }),
    });
    return response.json().catch(() => ({ ok: true }));
  }
}

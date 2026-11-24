import { BadRequestException, Injectable, Logger } from '@nestjs/common';

type Rrset = {
  name: string;
  type: string;
  ttl: number;
  changetype: 'REPLACE' | 'DELETE';
  records: Array<{ content: string; disabled: boolean }>;
};

@Injectable()
export class PowerDnsService {
  private readonly logger = new Logger(PowerDnsService.name);
  private readonly url = (process.env.PDNS_API_URL || 'http://powerdns:8081').replace(/\/$/, '');
  private readonly key = process.env.PDNS_API_KEY || '';
  private readonly zone = process.env.NODE_DNS_ZONE || 'node.h2onetwork.pro';
  private readonly ttl = Number(process.env.NODE_DNS_TTL || 60);

  private get enabled() {
    return Boolean(this.key);
  }

  private fqdn(label: string) {
    return `${label}.${this.zone}.`.toLowerCase();
  }

  private async patch(rrsets: Rrset[]) {
    if (!this.enabled) {
      this.logger.warn('PDNS_API_KEY not set — DNS changes are simulated');
      return;
    }
    const response = await fetch(`${this.url}/api/v1/servers/localhost/zones/${this.zone}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.key },
      body: JSON.stringify({ rrsets }),
    });
    if (!response.ok) {
      throw new BadRequestException(`PowerDNS API error ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
  }

  async setAddress(label: string, ipv4: string, ipv6?: string | null) {
    const sets: Rrset[] = [
      { name: this.fqdn(label), type: 'A', ttl: this.ttl, changetype: 'REPLACE', records: [{ content: ipv4, disabled: false }] },
    ];
    if (ipv6) {
      sets.push({ name: this.fqdn(label), type: 'AAAA', ttl: this.ttl, changetype: 'REPLACE', records: [{ content: ipv6, disabled: false }] });
    }
    await this.patch(sets);
  }

  async setTxt(label: string, value: string) {
    await this.patch([
      {
        name: this.fqdn(label),
        type: 'TXT',
        ttl: 60,
        changetype: 'REPLACE',
        records: [{ content: `"${value}"`, disabled: false }],
      },
    ]);
  }

  async removeTxt(label: string) {
    await this.patch([{ name: this.fqdn(label), type: 'TXT', ttl: 60, changetype: 'DELETE', records: [] }]);
  }

  async remove(label: string) {
    await this.patch([
      { name: this.fqdn(label), type: 'A', ttl: this.ttl, changetype: 'DELETE', records: [] },
      { name: this.fqdn(label), type: 'AAAA', ttl: this.ttl, changetype: 'DELETE', records: [] },
      { name: this.fqdn(label), type: 'TXT', ttl: 60, changetype: 'DELETE', records: [] },
    ]);
  }

  get zoneName() {
    return this.zone;
  }

  get isConfigured() {
    return this.enabled;
  }

  get apiUrl() {
    return this.url;
  }

  get apiKey() {
    return this.key;
  }
}

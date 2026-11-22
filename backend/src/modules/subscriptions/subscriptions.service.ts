import { Injectable } from '@nestjs/common';

@Injectable()
export class SubscriptionsService {
  getStatus(token: string) {
    return {
      token,
      status: 'active',
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      trafficUsed: 12.5,
      trafficLimit: 100,
      nodes: [
        { id: '1', name: 'Node-1', address: 'example.com', protocols: ['vless-reality', 'trojan'] },
      ],
      links: {
        vlessReality: 'vless://uuid@example.com:443?security=reality#XSS',
        trojan: 'trojan://password@example.com:443#XSS',
      },
    };
  }
}

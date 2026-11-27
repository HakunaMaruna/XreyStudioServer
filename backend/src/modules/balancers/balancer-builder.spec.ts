// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { encryptSecret } from '../../common/secret-crypto';
import { buildBalancers } from './balancer-builder';

describe('buildBalancers', () => {
  it('creates Xray balancer, selector, rule and observatory prefix', () => {
    const id = 'abcdef12-3456-7890-abcd-ef1234567890';
    const built = buildBalancers([{
      id,
      name: 'test',
      strategy: 'roundRobin',
      enabled: true,
      fallbackTag: 'direct',
      probeUrl: 'https://www.google.com/generate_204',
      probeIntervalSec: 30,
      observatoryMode: 'burstObservatory',
      burstDestination: 'https://connectivitycheck.gstatic.com/generate_204',
      burstIntervalSec: 60,
      burstSampling: 10,
      burstTimeoutSec: 5,
      rule: { domain: ['example.com'] },
      members: [
        { id: 'm1', protocol: 'vless', enabled: true, config: encryptSecret(JSON.stringify({ settings: { address: 'a.example.com', port: 443 } })) },
        { id: 'm2', protocol: 'trojan', enabled: true, config: encryptSecret(JSON.stringify({ settings: { address: 'b.example.com', port: 443 } })) },
      ],
    } as any]);

    expect(built.outbounds).toHaveLength(2);
    expect(built.outbounds[0]).toMatchObject({ tag: 'bal-abcdef12-out-1', protocol: 'vless' });
    expect(built.balancers[0]).toMatchObject({
      tag: 'balancer-abcdef12',
      selector: ['bal-abcdef12-out-'],
      fallbackTag: 'direct',
      strategy: { type: 'roundRobin' },
    });
    expect(built.rules[0]).toMatchObject({ balancerTag: 'balancer-abcdef12', domain: ['example.com'] });
    expect(built.observerSelectors).toEqual(['bal-abcdef12-out-']);
    expect(built.observatoryMode).toBe('burstObservatory');
    expect(built.burst).toMatchObject({ interval: '60s', sampling: 10, timeout: '5s' });
    expect(JSON.stringify(built)).not.toContain('v1:');
  });

  it('ignores disabled balancers and members', () => {
    const built = buildBalancers([{
      id: 'disabled', enabled: false, members: [], rule: null, strategy: 'random', fallbackTag: 'direct',
      probeUrl: '', probeIntervalSec: 30, name: '',
    } as any]);
    expect(built).toEqual({ outbounds: [], balancers: [], rules: [], observerSelectors: [] });
  });
});

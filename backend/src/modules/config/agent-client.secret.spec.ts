// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { AgentClientService } from './agent-client.service';
import { encryptSecret } from '../../common/secret-crypto';

describe('AgentClientService per-node secret', () => {
  it('sends the decrypted node secret instead of the global one', async () => {
    const captured: any[] = [];
    const service: any = new AgentClientService();
    (service as any).request = (url: string, _payload: any, _t?: number, _m?: string, _p?: boolean, secret?: string) => {
      captured.push({ url, secret });
      return Promise.resolve({ ok: true });
    };
    await service.restart({
      address: '10.0.0.5',
      agentSecret: encryptSecret('node-specific-secret'),
    });
    expect(captured[0].secret).toBe('node-specific-secret');
  });

  it('falls back to the global secret when the node has none', async () => {
    const captured: any[] = [];
    const service: any = new AgentClientService();
    const previous = process.env.AGENT_SECRET;
    process.env.AGENT_SECRET = 'global-secret';
    (service as any).request = (_url: string, _p: any, _t?: number, _m?: string, _p2?: boolean, secret?: string) => {
      captured.push(secret);
      return Promise.resolve({ ok: true });
    };
    await service.restart({ address: '10.0.0.6' });
    expect(captured[0]).toBe('global-secret');
    if (previous === undefined) delete process.env.AGENT_SECRET;
    else process.env.AGENT_SECRET = previous;
  });
});

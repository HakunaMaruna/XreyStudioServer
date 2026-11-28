// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { decryptSecret } from '../../common/secret-crypto';

export type BalancerMemberInput = {
  id: string;
  protocol: string;
  config: string;
  enabled: boolean;
  createdAt?: Date;
};

export type BalancerInput = {
  id: string;
  name: string;
  strategy: string;
  enabled: boolean;
  fallbackTag: string;
  probeUrl: string;
  probeIntervalSec: number;
  observatoryMode?: string;
  burstDestination?: string;
  burstIntervalSec?: number;
  burstSampling?: number;
  burstTimeoutSec?: number;
  rule: unknown;
  members: BalancerMemberInput[];
};

export type BuiltBalancers = {
  outbounds: Record<string, unknown>[];
  balancers: Record<string, unknown>[];
  rules: Record<string, unknown>[];
  observerSelectors: string[];
  probeUrl?: string;
  probeIntervalSec?: number;
  observatoryMode?: 'observatory' | 'burstObservatory';
  burst?: { destination: string; interval: string; sampling: number; timeout: string; httpMethod: 'HEAD' };
};

export const BALANCER_STRATEGIES = ['random', 'roundRobin', 'leastPing', 'leastLoad'] as const;

const MATCHERS = ['domain', 'ip', 'port', 'network', 'inboundTag', 'protocol', 'source', 'user'];

function normalizeRule(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const rule: Record<string, unknown> = {};
  for (const key of MATCHERS) {
    const value = source[key];
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
    rule[key] = value;
  }
  if (source.ruleTag) rule.ruleTag = source.ruleTag;
  return Object.keys(rule).some((key) => MATCHERS.includes(key)) ? rule : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns a stored member into an Xray outbound or returns null when Xray would
 * reject it. One broken member must not make `xray run -test` fail for the
 * whole node config.
 */
export function memberOutbound(protocol: string, parsed: Record<string, any>): Record<string, unknown> | null {
  const settings = { ...(parsed.settings || {}) } as Record<string, any>;
  const stream = parsed.streamSettings ? { ...parsed.streamSettings } as Record<string, any> : undefined;
  if (stream?.security === 'reality') {
    const reality = stream.realitySettings || {};
    if (!reality.publicKey) return null;
    delete stream.tlsSettings;
  }
  if (protocol === 'vless' || protocol === 'vmess') {
    if (!settings.vnext) {
      const client = Array.isArray(settings.clients) ? settings.clients[0] || {} : {};
      const id = String(settings.id || client.id || '');
      if (!UUID_RE.test(id)) return null;
      const user: Record<string, unknown> = { id };
      if (protocol === 'vless') {
        user.encryption = 'none';
        if (client.flow || settings.flow) user.flow = client.flow || settings.flow;
      } else {
        user.alterId = 0;
      }
      return {
        protocol,
        settings: { vnext: [{ address: settings.address, port: settings.port, users: [user] }] },
        ...(stream ? { streamSettings: stream } : {}),
      };
    }
  }
  return { protocol, settings, ...(stream ? { streamSettings: stream } : {}) };
}

export function buildBalancers(list: BalancerInput[], quarantined?: ReadonlySet<string>): BuiltBalancers {
  const result: BuiltBalancers = { outbounds: [], balancers: [], rules: [], observerSelectors: [] };
  let burstSource: BalancerInput | null = null;
  for (const balancer of list) {
    if (!balancer.enabled) continue;
    const prefix = `bal-${balancer.id.slice(0, 8)}-out-`;
    const memberTags: string[] = [];
    const members = [...balancer.members]
      .filter((member) => member.enabled)
      .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));

    members.forEach((member, index) => {
      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(decryptSecret(member.config));
      } catch {
        return;
      }
      // Quarantined exit addresses are excluded from generated configs until
      // their cooldown expires. This is how a blocked subnet is taken out of
      // rotation without deleting the balancer member.
      const address = String(parsed?.settings?.address || parsed?.address || '');
      if (quarantined?.has(address)) return;
      const outbound = memberOutbound(member.protocol, parsed);
      if (!outbound) return;
      const tag = `${prefix}${index + 1}`;
      result.outbounds.push({ tag, ...outbound });
      memberTags.push(tag);
    });

    if (!memberTags.length) continue;
    const tag = `balancer-${balancer.id.slice(0, 8)}`;
    result.balancers.push({
      tag,
      selector: [prefix],
      fallbackTag: balancer.fallbackTag || 'direct',
      strategy: { type: balancer.strategy || 'roundRobin' },
    });
    const rule = normalizeRule(balancer.rule);
    if (rule) result.rules.push({ ...rule, balancerTag: tag });
    result.observerSelectors.push(prefix);
    if (balancer.observatoryMode === 'burstObservatory' && !burstSource) burstSource = balancer;
    if (!result.probeUrl) {
      result.probeUrl = balancer.probeUrl;
      result.probeIntervalSec = balancer.probeIntervalSec;
    }
  }
  if (burstSource) {
    result.observatoryMode = 'burstObservatory';
    result.burst = {
      destination: burstSource.burstDestination || 'https://connectivitycheck.gstatic.com/generate_204',
      interval: `${burstSource.burstIntervalSec || 60}s`,
      sampling: burstSource.burstSampling || 10,
      timeout: `${burstSource.burstTimeoutSec || 5}s`,
      httpMethod: 'HEAD',
    };
  }
  return result;
}

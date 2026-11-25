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

export function buildBalancers(list: BalancerInput[]): BuiltBalancers {
  const result: BuiltBalancers = { outbounds: [], balancers: [], rules: [], observerSelectors: [] };
  for (const balancer of list) {
    if (!balancer.enabled) continue;
    const prefix = `bal-${balancer.id.slice(0, 8)}-out-`;
    const memberTags: string[] = [];
    const members = [...balancer.members]
      .filter((member) => member.enabled)
      .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));

    members.forEach((member, index) => {
      let parsed: Record<string, any> = {};
      try {
        parsed = JSON.parse(decryptSecret(member.config));
      } catch {
        return;
      }
      const tag = `${prefix}${index + 1}`;
      result.outbounds.push({
        tag,
        protocol: member.protocol,
        settings: parsed.settings || {},
        ...(parsed.streamSettings ? { streamSettings: parsed.streamSettings } : {}),
      });
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
    if (!result.probeUrl) {
      result.probeUrl = balancer.probeUrl;
      result.probeIntervalSec = balancer.probeIntervalSec;
    }
  }
  return result;
}

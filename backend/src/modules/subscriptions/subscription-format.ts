export const SUBSCRIPTION_FORMATS = ['raw', 'base64', 'clash', 'singbox', 'json'] as const;
export type SubscriptionFormat = (typeof SUBSCRIPTION_FORMATS)[number];

const UA_RULES: Array<{ pattern: RegExp; format: SubscriptionFormat }> = [
  // More specific clients must be checked before generic "clash" matches.
  { pattern: /sing[- ]?box/, format: 'singbox' },
  { pattern: /(happ|mihomo|clash\.meta|clash-meta|clashverge|clash-verge|clashforwindows|clash for windows|clashforandroid|clash for android)/, format: 'clash' },
  { pattern: /clash/, format: 'clash' },
  // Clients that consume base64-encoded proxy URI lists.
  { pattern: /(shadowrocket|quantumult|loon|stash| surge|surge\/)/, format: 'base64' },
  // INCY accepts base64 link lists and full Xray JSON, but not our custom panel JSON.
  { pattern: /incy/, format: 'base64' },
];

export function detectSubscriptionFormat(userAgent: string | undefined): SubscriptionFormat {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return 'json';
  for (const rule of UA_RULES) {
    if (rule.pattern.test(ua)) return rule.format;
  }
  return 'json';
}

export function parseSubscriptionFormat(value: string | undefined): SubscriptionFormat | null {
  if (!value) return null;
  return (SUBSCRIPTION_FORMATS as readonly string[]).includes(value)
    ? (value as SubscriptionFormat)
    : null;
}

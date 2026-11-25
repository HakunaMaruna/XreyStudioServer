export type DnsRecipe = {
  id: string;
  title: string;
  description: string;
  hosts: Record<string, string | string[]>;
  servers: Array<Record<string, unknown> | string>;
  options: Record<string, unknown>;
};

// Все рецепты проверены на синтаксис Xray DNS через `xray run -test`.
// geosite/geoip требуют актуальные geodata на ноде.
export const DNS_RECIPES: DnsRecipe[] = [
  {
    id: 'secure-doh',
    title: 'DoH без утечек',
    description: 'Cloudflare + Google DNS over HTTPS, без fallback на системный резолвер.',
    hosts: {},
    servers: [
      { address: 'https://1.1.1.1/dns-query', domains: ['geosite:geolocation-!cn'], skipFallback: true },
      { address: 'https://8.8.8.8/dns-query', skipFallback: true },
    ],
    options: { queryStrategy: 'UseIP', disableFallback: true, serveStale: true },
  },
  {
    id: 'ru-split',
    title: 'РФ-домены через локальный DNS',
    description: 'Российские домены резолвит локальный резолвер, остальные — DoH.',
    hosts: {},
    servers: [
      { address: 'localhost', domains: ['geosite:category-ru'], expectedIPs: ['geoip:ru'], skipFallback: true },
      { address: 'https://1.1.1.1/dns-query', skipFallback: true },
    ],
    options: { queryStrategy: 'UseIP', disableFallbackIfMatch: true },
  },
  {
    id: 'local-direct',
    title: 'Только локальный DNS',
    description: 'Минимальный профиль: системный резолвер без внешних запросов.',
    hosts: {},
    servers: ['localhost'],
    options: { queryStrategy: 'UseIP' },
  },
];

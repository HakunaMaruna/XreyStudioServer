export type RuleRecipe = {
  id: string;
  title: string;
  description: string;
  type: string;
  payload: Record<string, unknown>;
};

// Идеи из Mistgate (split DNS / country lists) и remnawave (geo-роутинг),
// оба под AGPL-3.0. Пayloads собраны самостоятельно под наш генератор Xray.
export const RULE_RECIPES: RuleRecipe[] = [
  {
    id: 'block-ads',
    title: 'Блокировать рекламу',
    description: 'Домены из geosite:category-ads-all идут в blackhole (outbound blocked).',
    type: 'field',
    payload: { type: 'field', domain: ['geosite:category-ads-all'], outboundTag: 'blocked' },
  },
  {
    id: 'ru-direct',
    title: 'Российские сайты напрямую',
    description: 'geosite:ru/category-ru и geoip:ru идут мимо туннеля. Нужны geodata-файлы на ноде.',
    type: 'field',
    payload: { type: 'field', domain: ['geosite:ru', 'geosite:category-ru'], ip: ['geoip:ru'], outboundTag: 'direct' },
  },
  {
    id: 'cn-direct',
    title: 'Китайские сайты напрямую',
    description: 'geosite:cn и geoip:cn идут мимо туннеля.',
    type: 'field',
    payload: { type: 'field', domain: ['geosite:cn'], ip: ['geoip:cn'], outboundTag: 'direct' },
  },
  {
    id: 'local-direct',
    title: 'Локальные сети напрямую',
    description: 'RFC1918 и loopback идут напрямую, без geoip-файлов.',
    type: 'field',
    payload: {
      type: 'field',
      ip: ['10.0.0.0/8', '127.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16'],
      outboundTag: 'direct',
    },
  },
  {
    id: 'block-adult',
    title: 'Блокировать 18+',
    description: 'geosite:porn уходит в blackhole.',
    type: 'field',
    payload: { type: 'field', domain: ['geosite:porn'], outboundTag: 'blocked' },
  },
  {
    id: 'block-torrents',
    title: 'Блокировать торренты',
    description: 'Трафик, распознанный как bittorrent, блокируется (sniffing включён).',
    type: 'field',
    payload: { type: 'field', protocol: ['bittorrent'], outboundTag: 'blocked' },
  },
  {
    id: 'dns-direct',
    title: 'DNS-запросы напрямую',
    description: 'Порт 53 идёт мимо туннеля, чтобы локальные резолверы работали.',
    type: 'field',
    payload: { type: 'field', port: '53', outboundTag: 'direct' },
  },
];

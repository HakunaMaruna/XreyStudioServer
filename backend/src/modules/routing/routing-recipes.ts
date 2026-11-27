// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
export type RoutingRecipe = {
  id: string;
  title: string;
  description: string;
  payload: {
    routingRules?: Record<string, unknown>[];
    dnsServers?: string[];
    outbounds?: Record<string, unknown>[];
  };
};

// Профили объединяются генератором конфига в routing.rules / dns.servers / outbounds.
// Все payload'ы проверены через `xray run -test` с актуальными geodata-файлами.
// Демо-рецепт с собственным outbound предназначен только для тестов, не для прода.
export const ROUTING_RECIPES: RoutingRecipe[] = [
  {
    id: 'local-dns-direct',
    title: 'Локальный DNS напрямую',
    description: 'DNS-запросы (порт 53) идут мимо туннеля, серверы 1.1.1.1 / 8.8.8.8 / localhost.',
    payload: {
      dnsServers: ['1.1.1.1', '8.8.8.8', 'localhost'],
      routingRules: [{ type: 'field', port: '53', outboundTag: 'direct' }],
    },
  },
  {
    id: 'ru-direct',
    title: 'Российские сайты напрямую',
    description: 'geosite:category-ru и geoip:ru идут мимо туннеля. Нужны geodata на ноде.',
    payload: {
      routingRules: [
        { type: 'field', domain: ['geosite:category-ru'], ip: ['geoip:ru'], outboundTag: 'direct' },
      ],
    },
  },
  {
    id: 'block-ads',
    title: 'Блокировать рекламу',
    description: 'Домены geosite:category-ads-all уходят в blackhole.',
    payload: {
      routingRules: [
        { type: 'field', domain: ['geosite:category-ads-all'], outboundTag: 'blocked' },
      ],
    },
  },
  {
    id: 'block-torrents',
    title: 'Блокировать торренты',
    description: 'Трафик bittorrent блокируется (sniffing включён).',
    payload: {
      routingRules: [{ type: 'field', protocol: ['bittorrent'], outboundTag: 'blocked' }],
    },
  },
  {
    id: 'test-custom-outbound',
    title: 'ТЕСТ: собственный outbound',
    description: 'Демо-профиль с outbound xss-test-direct для 10.0.0.0/8 и DNS 9.9.9.9. Только для проверки генерации конфига.',
    payload: {
      dnsServers: ['9.9.9.9', 'localhost'],
      outbounds: [{ tag: 'xss-test-direct', protocol: 'freedom' }],
      routingRules: [
        { type: 'field', ip: ['10.0.0.0/8'], outboundTag: 'xss-test-direct' },
        { type: 'field', port: '53', outboundTag: 'direct' },
      ],
    },
  },
];

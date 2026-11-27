// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
export type HostRecipe = {
  id: string;
  title: string;
  description: string;
  port: number;
  sni?: string;
  path?: string;
  transport: string;
  security: string;
  dns: string;
};

// Идеи из mistgate (AGPL-3.0) и remnawave (AGPL-3.0) — реализовано самостоятельно.
export const HOST_RECIPES: HostRecipe[] = [
  {
    id: 'reality',
    title: 'VLESS Reality (один port)',
    description: 'Свой порт, трафик маскируется под HTTPS. Имя (SNI) берётся из настроек Reality подключения.',
    port: 443,
    transport: 'tcp',
    security: 'reality',
    dns: 'A-запись домена ноды → IP ноды (без прокси CDN)',
  },
  {
    id: 'shared-443',
    title: 'Общий порт 443 по SNI',
    description: 'Несколько протоколов на одном TCP 443. Каждый хост получает своё имя, запрос без имени уходит на дефолтный сервис.',
    port: 443,
    sni: 'cdn.example.com',
    transport: 'tcp',
    security: 'tls',
    dns: 'A или CNAME: уникальное имя → IP/домен ноды, без прокси',
  },
  {
    id: 'ws-cdn',
    title: 'VLESS WebSocket за CDN',
    description: 'Путь /ws и Host в SNI; подходит, когда напрямую открывается только 443.',
    port: 443,
    sni: 'cdn.example.com',
    path: '/ws',
    transport: 'ws',
    security: 'tls',
    dns: 'CNAME домена на CDN, режим DNS only',
  },
  {
    id: 'hysteria2',
    title: 'Hysteria2 (UDP)',
    description: 'QUIC/UDP, общий порт по SNI не поддерживается — нужен отдельный UDP порт.',
    port: 443,
    sni: 'h2.example.com',
    transport: 'quic',
    security: 'tls',
    dns: 'A-запись домена → IP ноды, UDP 443 открыт',
  },
  {
    id: 'trojan',
    title: 'Trojan over TLS',
    description: 'Классический TLS на 443 с паролем-токеном подписки.',
    port: 443,
    sni: 'trojan.example.com',
    transport: 'tcp',
    security: 'tls',
    dns: 'A или CNAME домена → нода',
  },
  {
    id: 'decoy',
    title: 'Decoy-сайт / fallback',
    description: 'Заглушка для чужих подключений: отвечает на неизвестный SNI, не выдавая панель.',
    port: 443,
    sni: 'www.example.com',
    transport: 'tcp',
    security: 'tls',
    dns: 'A-запись домена → IP ноды',
  },
];

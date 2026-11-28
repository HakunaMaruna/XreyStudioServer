// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Ports the agent container publishes (docker-compose.node.yml). Xray can listen
 * on any port, but only these are reachable from outside on a Docker node.
 * Order is the preference for automatic selection.
 */
export const NODE_PUBLISHED_PORTS: readonly number[] = [
  443, 2054, 4436, 2053, ...range(5050, 5060), ...range(10000, 10010),
];

/** Preferred port if it is free, otherwise the first free published port. */
export function pickFreePort(used: ReadonlySet<number>, preferred?: number): number | null {
  if (preferred && !used.has(preferred)) return preferred;
  return NODE_PUBLISHED_PORTS.find((port) => !used.has(port)) ?? null;
}

type PortLookup = {
  inbound: { findMany(args: any): Promise<Array<{ id: string; tag: string; port: number; listen: string | null }>> };
  proxyChainHop: { findMany(args: any): Promise<Array<{ port: number }>> };
};

/** Ports already taken on a node by inbounds and chain hops (unix sockets ignored). */
export async function nodeUsedPorts(prisma: PortLookup, nodeId: string, excludeInboundId?: string) {
  const [inbounds, hops] = await Promise.all([
    prisma.inbound.findMany({ where: { nodeId }, select: { id: true, tag: true, port: true, listen: true } }),
    prisma.proxyChainHop.findMany({ where: { nodeId }, select: { port: true } }),
  ]);
  const owners = new Map<number, string>();
  for (const row of inbounds) {
    if (row.id === excludeInboundId || isSocket(row.listen)) continue;
    owners.set(row.port, row.tag);
  }
  for (const hop of hops) if (!owners.has(hop.port)) owners.set(hop.port, 'proxy chain');
  return owners;
}

export function isSocket(listen?: string | null) {
  return Boolean(listen && (listen.startsWith('@') || listen.startsWith('/')));
}

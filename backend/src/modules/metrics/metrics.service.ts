// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private prisma: PrismaService) {}

  /** Aggregated traffic by node, used by the per-node/per-profile report. */
  async nodeTraffic() {
    const [rows, nodes] = await Promise.all([
      this.prisma.userTraffic.groupBy({
        by: ['nodeId', 'period'],
        _sum: { bytesUp: true, bytesDown: true },
      }),
      this.prisma.node.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const names = new Map(nodes.map((node) => [node.id, node.name]));
    return rows.map((row) => ({
      nodeId: row.nodeId,
      nodeName: row.nodeId ? (names.get(row.nodeId) ?? 'unknown') : 'unassigned',
      period: row.period,
      bytesUp: (row._sum.bytesUp ?? 0n).toString(),
      bytesDown: (row._sum.bytesDown ?? 0n).toString(),
    }));
  }

  async render() {
    const [users, activeUsers, nodes, onlineNodes, payments, latestMetrics] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.node.count(),
      this.prisma.node.count({ where: { status: 'ONLINE' } }),
      this.prisma.payment.count(),
      this.prisma.nodeMetric.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);

    const mem = process.memoryUsage();
    const lines = [
      '# HELP xss_users_total Total users',
      '# TYPE xss_users_total gauge',
      `xss_users_total ${users}`,
      '# HELP xss_users_active Active users',
      '# TYPE xss_users_active gauge',
      `xss_users_active ${activeUsers}`,
      '# HELP xss_nodes_total Total nodes',
      '# TYPE xss_nodes_total gauge',
      `xss_nodes_total ${nodes}`,
      '# HELP xss_nodes_online Online nodes',
      '# TYPE xss_nodes_online gauge',
      `xss_nodes_online ${onlineNodes}`,
      '# HELP xss_payments_total Total payments',
      '# TYPE xss_payments_total gauge',
      `xss_payments_total ${payments}`,
      '# HELP xss_process_memory_bytes Process memory',
      '# TYPE xss_process_memory_bytes gauge',
      `xss_process_memory_bytes{type="rss"} ${mem.rss}`,
      `xss_process_memory_bytes{type="heapUsed"} ${mem.heapUsed}`,
    ];

    for (const metric of latestMetrics) {
      lines.push(`xss_node_cpu_percent{node="${metric.nodeId}"} ${metric.cpu}`);
      lines.push(`xss_node_ram_percent{node="${metric.nodeId}"} ${metric.ram}`);
      lines.push(`xss_node_disk_percent{node="${metric.nodeId}"} ${metric.disk}`);
      lines.push(`xss_node_connections{node="${metric.nodeId}"} ${metric.connections}`);
    }

    return lines.join('\n') + '\n';
  }
}

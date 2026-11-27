// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import * as os from 'os';
import { promisify } from 'util';

const run = promisify(execFile);

export type HostMetrics = {
  cpu: number;
  ram: number;
  disk: number;
  networkRxBps: number;
  networkTxBps: number;
  cores: number;
  uptimeSec: number;
  sampledAt: string;
};

/** Real host metrics of the machine running the panel, sampled from OS counters. */
@Injectable()
export class HostMetricsService {
  private cache?: { at: number; value: HostMetrics };
  private lastNet?: { at: number; rx: number; tx: number };

  async read(): Promise<HostMetrics> {
    if (this.cache && Date.now() - this.cache.at < 5000) return this.cache.value;

    const cpusBefore = os.cpus();
    const netBefore = this.readNet();
    const before = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const cpusAfter = os.cpus();
    const netAfter = this.readNet();
    const elapsed = Math.max(1, Date.now() - before) / 1000;

    let total = 0;
    let idle = 0;
    for (let index = 0; index < cpusAfter.length; index += 1) {
      const beforeTimes = cpusBefore[index]?.times;
      const afterTimes = cpusAfter[index]?.times;
      if (!beforeTimes || !afterTimes) continue;
      const sum = (times: { user: number; nice: number; sys: number; irq: number; idle: number }) =>
        times.user + times.nice + times.sys + times.irq + times.idle;
      total += sum(afterTimes) - sum(beforeTimes);
      idle += afterTimes.idle - beforeTimes.idle;
    }
    const cpu = total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ram = totalMem > 0 ? Math.max(0, Math.min(100, ((totalMem - freeMem) / totalMem) * 100)) : 0;

    const disk = await this.diskUsage();

    let rxBps = 0;
    let txBps = 0;
    if (netBefore && netAfter && this.lastNet) {
      rxBps = Math.max(0, (netAfter.rx - this.lastNet.rx) / elapsed);
      txBps = Math.max(0, (netAfter.tx - this.lastNet.tx) / elapsed);
    }
    this.lastNet = { at: Date.now(), rx: netAfter?.rx || 0, tx: netAfter?.tx || 0 };

    const value: HostMetrics = {
      cpu: Number(cpu.toFixed(1)),
      ram: Number(ram.toFixed(1)),
      disk,
      networkRxBps: Math.round(rxBps),
      networkTxBps: Math.round(txBps),
      cores: cpusAfter.length,
      uptimeSec: Math.round(os.uptime()),
      sampledAt: new Date().toISOString(),
    };
    this.cache = { at: Date.now(), value };
    return value;
  }

  private readNet(): { rx: number; tx: number } | null {
    try {
      const text = readFileSync('/proc/net/dev', 'utf8');
      let rx = 0;
      let tx = 0;
      for (const line of text.split('\n').slice(2)) {
        const [name, data] = line.split(':');
        if (!name || !data || name.trim() === 'lo') continue;
        const columns = data.trim().split(/\s+/);
        rx += Number(columns[0]) || 0;
        tx += Number(columns[8]) || 0;
      }
      return { rx, tx };
    } catch {
      return null;
    }
  }

  private async diskUsage(): Promise<number> {
    try {
      const { stdout } = await run('df', ['-P', '/']);
      const line = stdout.split('\n').find((row) => row.startsWith('/') || row.trim().split(/\s+/)[5] === '/');
      const fields = line?.trim().split(/\s+/);
      const percent = fields ? Number(String(fields[4]).replace('%', '')) : 0;
      return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    } catch {
      return 0;
    }
  }
}

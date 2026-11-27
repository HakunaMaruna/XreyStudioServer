// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { HostMetricsService } from './host-metrics.service';

describe('HostMetricsService', () => {
  it('returns host metrics in range', async () => {
    const metrics = await new HostMetricsService().read();
    expect(metrics.cpu).toBeGreaterThanOrEqual(0);
    expect(metrics.cpu).toBeLessThanOrEqual(100);
    expect(metrics.ram).toBeGreaterThanOrEqual(0);
    expect(metrics.ram).toBeLessThanOrEqual(100);
    expect(metrics.disk).toBeGreaterThanOrEqual(0);
    expect(metrics.disk).toBeLessThanOrEqual(100);
    expect(metrics.cores).toBeGreaterThan(0);
  });
});

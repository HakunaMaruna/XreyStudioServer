// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException } from '@nestjs/common';
import { DoctorService } from './doctor.service';

describe('DoctorService', () => {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    node: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'node-1', status: 'ONLINE' }),
    },
    healthCheck: { findMany: jest.fn().mockResolvedValue([]) },
    configRevision: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  const config = { applyRevision: jest.fn().mockResolvedValue({ applied: true }) };
  const service = new DoctorService(prisma as never, config as never);

  it('reports clean state when there are no nodes', async () => {
    const checks = await service.check();
    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'database', severity: 'ok' }),
        expect.objectContaining({ id: 'nodes_offline', severity: 'ok' }),
      ]),
    );
  });

  it('rejects fixes other than the explicit allow-list', async () => {
    await expect(service.fix('drop_database', 'node-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.fix('stale_revision', '../etc')).rejects.toBeInstanceOf(BadRequestException);
    expect(config.applyRevision).not.toHaveBeenCalled();
  });

  it('applies a revision only for an ONLINE node', async () => {
    await expect(service.fix('stale_revision', 'node-1')).resolves.toEqual({ applied: true });
    expect(config.applyRevision).toHaveBeenCalledWith('node-1');
  });
});

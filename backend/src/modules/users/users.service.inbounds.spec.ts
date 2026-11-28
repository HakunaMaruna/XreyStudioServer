// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService.setInbounds', () => {
  const actor = { userId: 'admin', email: 'a@e.com', role: Role.ADMIN } as any;
  let prisma: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
      inboundClient: {
        findMany: jest.fn().mockResolvedValue([
          { inboundId: 'i1', sourceSquadId: null },
          { inboundId: 'i2', sourceSquadId: null },
          { inboundId: 'i3', sourceSquadId: 'sq' },
        ]),
        deleteMany: jest.fn((args) => args),
        createMany: jest.fn((args) => args),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const inbounds = { findAll: jest.fn().mockResolvedValue([{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }, { id: 'i4' }]) };
    service = new UsersService(prisma, {} as any, {} as any, inbounds as any);
  });

  it('attaches to every visible inbound in "all" mode', async () => {
    const result = await service.setInbounds('u1', { mode: 'all' }, actor);
    expect(result).toEqual({ mode: 'all', inboundIds: ['i1', 'i2', 'i3', 'i4'], added: 1, removed: 0 });
    expect(prisma.inboundClient.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ inboundId: 'i4', userId: 'u1', enabled: true }] }),
    );
  });

  it('replaces manual bindings but keeps squad bindings in "selected" mode', async () => {
    const result = await service.setInbounds('u1', { mode: 'selected', inboundIds: ['i2', 'i4'] }, actor);
    expect(result).toMatchObject({ added: 1, removed: 1 });
    expect(prisma.inboundClient.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', sourceSquadId: null, inboundId: { in: ['i1'] } },
    });
  });

  it('requires exactly one inbound in "one" mode', async () => {
    await expect(service.setInbounds('u1', { mode: 'one', inboundIds: ['i1', 'i2'] }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inbounds the actor cannot see', async () => {
    await expect(service.setInbounds('u1', { mode: 'selected', inboundIds: ['zzz'] }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Role } from '@prisma/client';
import { SubscriptionTemplatesService } from './subscription-templates.service';

const admin = { userId: 'u1', role: Role.ADMIN, organizationId: null } as any;

describe('SubscriptionTemplatesService', () => {
  it('clears other defaults when a template is marked default', async () => {
    const prisma: any = {
      subscriptionTemplate: {
        findFirst: jest.fn(async () => ({ id: 't2', organizationId: null })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async ({ data }: any) => data),
      },
    };
    const service = new SubscriptionTemplatesService(prisma);
    await service.update('t2', { isDefault: true } as any, admin);
    expect(prisma.subscriptionTemplate.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isDefault: true, id: { not: 't2' } }),
      data: { isDefault: false },
    }));
    expect(prisma.subscriptionTemplate.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isDefault: true }),
    }));
  });
});

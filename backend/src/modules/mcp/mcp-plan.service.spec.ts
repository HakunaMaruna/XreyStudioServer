// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Role, UserStatus } from '@prisma/client';
import { McpActor, McpPlanService } from './mcp-plan.service';

describe('McpPlanService', () => {
  const APPROVAL_TOKEN = 'owner-approval-token-0123456789';
  const admin: McpActor = { userId: 'actor-admin', email: 'admin@example.com', role: Role.ADMIN };
  const target = {
    id: 'user-1',
    email: 'user@example.com',
    status: UserStatus.ACTIVE,
    role: Role.USER,
    organizationId: null,
  };

  const prisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  let service: McpPlanService;

  beforeEach(() => {
    process.env.MCP_APPROVAL_TOKEN = APPROVAL_TOKEN;
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ ...target });
    prisma.user.update.mockResolvedValue({ id: target.id, email: target.email, status: UserStatus.DISABLED });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    service = new McpPlanService(prisma);
  });

  const input = {
    email: target.email,
    status: UserStatus.DISABLED,
    reason: 'Suspicious activity, temporary suspension',
  };

  it('creates a pending plan without modifying the database', async () => {
    const plan = await service.createUserStatusPlan(admin, input);

    expect(plan).toMatchObject({
      id: expect.any(String),
      status: 'pending',
      actor: { userId: admin.userId, role: Role.ADMIN },
      email: target.email,
      oldStatus: UserStatus.ACTIVE,
      newStatus: UserStatus.DISABLED,
      reason: input.reason,
      plannedAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(new Date(plan.expiresAt).getTime() - new Date(plan.plannedAt).getTime()).toBe(5 * 60 * 1000);
    expect((plan as any).approvalToken).toBeUndefined();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: target.email },
      select: { status: true },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects approval without the correct owner token', async () => {
    const plan = await service.createUserStatusPlan(admin, input);

    await expect(
      service.approveUserStatusPlan(admin, { planId: plan.id, approvalToken: 'wrong-token-0123456789' }),
    ).rejects.toThrow(/Invalid approval token/);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: target.email },
      select: { status: true },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('applies an approved plan once, writes an audit record, and rejects a second approval', async () => {
    const plan = await service.createUserStatusPlan(admin, input);

    const result = await service.approveUserStatusPlan(admin, {
      planId: plan.id,
      approvalToken: APPROVAL_TOKEN,
    });
    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({ id: target.id, status: UserStatus.DISABLED });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { status: UserStatus.DISABLED },
      select: { id: true, email: true, status: true },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: admin.userId,
        action: 'MCP_APPROVE_USER_STATUS',
        entity: 'User',
        entityId: target.id,
        metadata: expect.objectContaining({ planId: plan.id, reason: input.reason }),
      }),
    });
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(APPROVAL_TOKEN);

    await expect(
      service.approveUserStatusPlan(admin, { planId: plan.id, approvalToken: APPROVAL_TOKEN }),
    ).rejects.toThrow(/already used/);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired plan', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const plan = await service.createUserStatusPlan(admin, input);
      clock.mockReturnValue(now + 5 * 60 * 1000 + 1);

      await expect(
        service.approveUserStatusPlan(admin, { planId: plan.id, approvalToken: APPROVAL_TOKEN }),
      ).rejects.toThrow(/expired/);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it('refuses to let the actor change their own account or an admin account', async () => {
    const selfPlan = await service.createUserStatusPlan(admin, { ...input, email: admin.email! });
    prisma.user.findUnique.mockResolvedValue({ ...target, id: admin.userId, email: admin.email });
    await expect(
      service.approveUserStatusPlan(admin, { planId: selfPlan.id, approvalToken: APPROVAL_TOKEN }),
    ).rejects.toThrow(/own account/);

    const adminPlan = await service.createUserStatusPlan(admin, input);
    prisma.user.findUnique.mockResolvedValue({ ...target, role: Role.ADMIN });
    await expect(
      service.approveUserStatusPlan(admin, { planId: adminPlan.id, approvalToken: APPROVAL_TOKEN }),
    ).rejects.toThrow(/ADMIN accounts/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

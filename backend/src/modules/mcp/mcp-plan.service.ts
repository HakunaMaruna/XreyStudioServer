// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const PLAN_TTL_MS = 5 * 60 * 1000;
const MIN_APPROVAL_TOKEN_LENGTH = 16;

/** Identity established by McpGuard from the JWT — never from tool arguments. */
export type McpActor = {
  userId: string;
  email?: string;
  role: Role;
  organizationId?: string | null;
};

export type UserStatusPlan = {
  id: string;
  actor: {
    userId: string;
    email?: string;
    role: Role;
  };
  email: string;
  oldStatus: UserStatus;
  newStatus: UserStatus;
  reason: string;
  plannedAt: string;
  expiresAt: string;
  status: 'pending' | 'used';
};

type StoredPlan = UserStatusPlan & {
  actorRole: Role;
  expiresAtMs: number;
  status: 'pending' | 'used';
};

function getApprovalToken(): string | null {
  const token = process.env.MCP_APPROVAL_TOKEN;
  return token && token.length >= MIN_APPROVAL_TOKEN_LENGTH ? token : null;
}

@Injectable()
export class McpPlanService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly plans = new Map<string, StoredPlan>();

  private toPublicPlan(plan: StoredPlan): UserStatusPlan {
    return {
      id: plan.id,
      actor: { ...plan.actor },
      email: plan.email,
      oldStatus: plan.oldStatus,
      newStatus: plan.newStatus,
      reason: plan.reason,
      plannedAt: plan.plannedAt,
      expiresAt: plan.expiresAt,
      status: plan.status,
    };
  }

  /**
   * Build and store a plan. Reads the target only to report its current status — no writes.
   * The database stays untouched even when the target does not exist.
   */
  async createUserStatusPlan(
    actor: McpActor,
    input: { email: string; status: UserStatus; reason: string },
  ): Promise<UserStatusPlan> {
    if (!actor?.userId || !actor.role) {
      throw new UnauthorizedException('MCP actor is not authenticated');
    }

    const email = input.email.trim().toLowerCase();
    const reason = input.reason.trim();
    if (reason.length < 1 || reason.length > 500) {
      throw new ForbiddenException('Plan reason must be 1..500 characters');
    }

    const target = await this.prisma.user.findUnique({
      where: { email },
      select: { status: true },
    });
    if (!target) throw new NotFoundException('Plan target user not found');

    const plannedAtMs = Date.now();
    const plan: StoredPlan = {
      id: randomUUID(),
      actor: {
        userId: actor.userId,
        email: actor.email,
        role: actor.role,
      },
      actorRole: actor.role,
      email,
      oldStatus: target.status,
      newStatus: input.status,
      reason,
      plannedAt: new Date(plannedAtMs).toISOString(),
      expiresAt: new Date(plannedAtMs + PLAN_TTL_MS).toISOString(),
      expiresAtMs: plannedAtMs + PLAN_TTL_MS,
      status: 'pending',
    };
    this.plans.set(plan.id, plan);
    return this.toPublicPlan(plan);
  }

  /** Apply a plan after explicit owner approval. Plans are single-use. */
  async approveUserStatusPlan(
    actor: McpActor,
    input: { planId: string; approvalToken: string },
  ): Promise<{ success: true; plan: UserStatusPlan; user: { id: string; email: string; status: UserStatus } }> {
    if (!actor?.userId || !actor.role) {
      throw new UnauthorizedException('MCP actor is not authenticated');
    }

    // The owner token is valid only when it was explicitly configured by the server operator.
    const configuredToken = getApprovalToken();
    if (!configuredToken) {
      throw new ServiceUnavailableException({
        message: 'MCP_APPROVAL_TOKEN must be set and at least 16 characters long to approve plans',
        code: 'MCP_APPROVAL_TOKEN_MISSING',
      });
    }
    const supplied = Buffer.from(input.approvalToken ?? '', 'utf8');
    const expected = Buffer.from(configuredToken, 'utf8');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException('Invalid approval token');
    }
    // The approval token itself must never end up in a plan, response or audit record.

    const plan = this.plans.get(input.planId);
    if (!plan || plan.status !== 'pending') {
      throw new NotFoundException('Plan not found or already used');
    }
    if (plan.expiresAtMs <= Date.now()) {
      plan.status = 'used';
      throw new ForbiddenException('Plan expired');
    }
    if (plan.actor.userId !== actor.userId || plan.actorRole !== actor.role) {
      throw new ForbiddenException('Plan belongs to a different MCP actor');
    }
    if (actor.role !== Role.ADMIN && plan.actorRole === Role.ADMIN) {
      throw new ForbiddenException('Plan requires admin MCP privileges');
    }

    // Re-read current data before applying: the plan is a proposal, not a snapshot to trust.
    const target = await this.prisma.user.findUnique({
      where: { email: plan.email },
      select: { id: true, email: true, status: true, role: true, organizationId: true },
    });
    if (!target) throw new NotFoundException('Plan target user not found');
    if (target.status !== plan.oldStatus) {
      throw new ForbiddenException('Target status changed since the plan was created; create a new plan');
    }
    if (target.id === actor.userId) {
      throw new ForbiddenException('An actor cannot change their own account via MCP');
    }
    if (target.role === Role.ADMIN) {
      throw new ForbiddenException('ADMIN accounts cannot be status-changed via MCP');
    }
    // The plan carries no role field: only status changes are possible, so a role downgrade
    // of the actor is structurally impossible. The checks above also protect actor and ADMINs.
    if (actor.role !== Role.ADMIN) {
      if (target.organizationId && target.organizationId !== actor.organizationId) {
        throw new ForbiddenException('Plan target is outside the actor organization');
      }
    }
    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { status: plan.newStatus },
      select: { id: true, email: true, status: true },
    });

    plan.status = 'used';
    await this.prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: 'MCP_APPROVE_USER_STATUS',
        entity: 'User',
        entityId: target.id,
        metadata: {
          planId: plan.id,
          email: plan.email,
          oldStatus: target.status,
          newStatus: plan.newStatus,
          reason: plan.reason,
          approvedByRole: actor.role,
        } as Prisma.InputJsonValue,
      },
    });

    return { success: true, plan: this.toPublicPlan(plan), user: updated };
  }
}

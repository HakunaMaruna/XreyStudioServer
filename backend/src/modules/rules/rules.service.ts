import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRuleDto, UpdateRuleDto } from './dto/rule.dto';
import { RULE_RECIPES } from './rule-recipes';

@Injectable()
export class RulesService {
  constructor(private prisma: PrismaService) {}

  private tenantWhere(user: AuthUser): Prisma.RuleWhereInput {
    if (user.role === Role.ADMIN) return {};
    return { organizationId: user.organizationId || null };
  }

  private assertOrganization(dto: { organizationId?: string | null }, user: AuthUser) {
    if (user.role === Role.ADMIN) return;
    if (!user.organizationId) throw new ForbiddenException('Organization is required to manage rules');
    if (dto.organizationId && dto.organizationId !== user.organizationId) {
      throw new ForbiddenException('Cannot assign a rule to another organization');
    }
  }

  private async assertInbound(dto: { inboundId?: string | null }, user: AuthUser) {
    if (!dto.inboundId) return;
    const inbound = await this.prisma.inbound.findUnique({
      where: { id: dto.inboundId },
      include: { node: { select: { organizationId: true } }, user: { select: { organizationId: true } } },
    });
    if (!inbound) throw new NotFoundException('Inbound not found');
    if (user.role !== Role.ADMIN && inbound.node?.organizationId !== user.organizationId
        && inbound.user?.organizationId !== user.organizationId) {
      throw new ForbiddenException('Inbound belongs to another organization');
    }
  }

  findAll(user: AuthUser) {
    return this.prisma.rule.findMany({
      where: this.tenantWhere(user),
      orderBy: { createdAt: 'desc' },
      include: { inbound: { select: { id: true, tag: true, port: true } } },
    });
  }

  async findOne(id: string, user: AuthUser) {
    const found = await this.prisma.rule.findFirst({
      where: { id, ...this.tenantWhere(user) },
      include: { inbound: { select: { id: true, tag: true, port: true } } },
    });
    if (!found) throw new NotFoundException('Rule not found');
    return found;
  }

  recipes() {
    return RULE_RECIPES;
  }

  // Проверка перед сохранением: правило должно быть применимо генератором Xray.
  validate(payload: Record<string, unknown>) {
    const errors: string[] = [];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { valid: false, errors: ['payload must be an object'] };
    }
    const p = payload as Record<string, unknown>;
    if (typeof p.type !== 'string' || !p.type) errors.push('type is required');
    const tag = p.outboundTag;
    if (tag !== undefined && typeof tag !== 'string') errors.push('outboundTag must be a string');
    if (tag && !['direct', 'blocked'].includes(String(tag))) errors.push(`unknown outboundTag: ${tag}`);
    for (const key of ['domain', 'ip', 'protocol', 'port']) {
      if (p[key] !== undefined && typeof p[key] !== 'string' && !Array.isArray(p[key])) {
        errors.push(`${key} must be a string or an array`);
      }
    }
    if (!['domain', 'ip', 'protocol', 'port', 'inboundTag', 'source', 'network'].some((k) => p[k] !== undefined)) {
      errors.push('rule needs at least one matcher (domain/ip/protocol/port/...)');
    }
    return { valid: errors.length === 0, errors };
  }

  async create(dto: CreateRuleDto, user: AuthUser) {
    this.assertOrganization(dto, user);
    await this.assertInbound(dto, user);
    const check = this.validate(dto.payload);
    if (!check.valid) throw new ForbiddenException(`Invalid rule: ${check.errors.join(', ')}`);
    return this.prisma.rule.create({
      data: {
        name: dto.name,
        type: dto.type,
        payload: dto.payload as any,
        recipe: dto.recipe,
        note: dto.note,
        enabled: dto.enabled ?? true,
        organizationId: dto.organizationId ?? user.organizationId ?? null,
        inboundId: dto.inboundId || null,
      },
    });
  }

  async update(id: string, dto: UpdateRuleDto, user: AuthUser) {
    await this.findOne(id, user);
    this.assertOrganization(dto, user);
    await this.assertInbound(dto, user);
    if (dto.payload !== undefined) {
      const check = this.validate(dto.payload);
      if (!check.valid) throw new ForbiddenException(`Invalid rule: ${check.errors.join(', ')}`);
    }
    return this.prisma.rule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.payload !== undefined ? { payload: dto.payload as any } : {}),
        ...(dto.recipe !== undefined ? { recipe: dto.recipe } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.organizationId !== undefined ? { organizationId: dto.organizationId } : {}),
        ...(dto.inboundId !== undefined ? { inboundId: dto.inboundId || null } : {}),
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    await this.prisma.rule.delete({ where: { id } });
    return { success: true };
  }
}

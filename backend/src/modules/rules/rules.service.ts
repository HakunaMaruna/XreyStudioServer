import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRuleDto, UpdateRuleDto } from './dto/rule.dto';

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

  findAll(user: AuthUser) {
    return this.prisma.rule.findMany({
      where: this.tenantWhere(user),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthUser) {
    const found = await this.prisma.rule.findFirst({ where: { id, ...this.tenantWhere(user) } });
    if (!found) throw new NotFoundException('Rule not found');
    return found;
  }

  create(dto: CreateRuleDto, user: AuthUser) {
    this.assertOrganization(dto, user);
    return this.prisma.rule.create({
      data: {
        name: dto.name,
        type: dto.type,
        payload: dto.payload as any,
        enabled: dto.enabled ?? true,
        organizationId: dto.organizationId ?? user.organizationId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateRuleDto, user: AuthUser) {
    await this.findOne(id, user);
    this.assertOrganization(dto, user);
    return this.prisma.rule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.payload !== undefined ? { payload: dto.payload as any } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.organizationId !== undefined ? { organizationId: dto.organizationId } : {}),
      },
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    await this.prisma.rule.delete({ where: { id } });
    return { success: true };
  }
}

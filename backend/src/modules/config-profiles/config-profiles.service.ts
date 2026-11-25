import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

type ProfileData = {
  name: string;
  description?: string;
  payload: unknown;
  enabled?: boolean;
  nodeId?: string | null;
  organizationId?: string | null;
};

@Injectable()
export class ConfigProfilesService {
  constructor(private prisma: PrismaService) {}

  // Глобальные профили (organizationId = null) — общие дефолты панели: их видят
  // все, но правят только ADMIN или владелец-тенант.
  private readWhere(actor: AuthUser): Prisma.ConfigProfileWhereInput {
    if (actor.role === Role.ADMIN) return {};
    return { OR: [{ organizationId: actor.organizationId || null }, { organizationId: null }] };
  }

  private writeWhere(actor: AuthUser): Prisma.ConfigProfileWhereInput {
    if (actor.role === Role.ADMIN) return {};
    return { organizationId: actor.organizationId || null };
  }

  private assertOrganization(data: { organizationId?: string | null }, actor: AuthUser) {
    if (actor.role === Role.ADMIN) return;
    if (data.organizationId && data.organizationId !== actor.organizationId) {
      throw new ForbiddenException('Cannot assign a config profile to another organization');
    }
  }

  list(actor: AuthUser) {
    return this.prisma.configProfile.findMany({
      where: this.readWhere(actor),
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } }, node: { select: { id: true, name: true } } },
    });
  }

  find(id: string, actor: AuthUser) {
    return this.prisma.configProfile.findFirst({ where: { id, ...this.readWhere(actor) } });
  }

  private async validateNodeId(nodeId: string | null | undefined, actor: AuthUser): Promise<void> {
    if (!nodeId) return;
    const node = await this.prisma.node.findFirst({
      where: {
        id: nodeId,
        ...(actor.role === Role.ADMIN
          ? {}
          : { OR: [{ organizationId: actor.organizationId || null }, { organizationId: null }] }),
      },
      select: { id: true },
    });
    if (!node) throw new BadRequestException('Unknown or foreign node');
  }

  async create(data: ProfileData, actor: AuthUser) {
    this.assertOrganization(data, actor);
    await this.validateNodeId(data.nodeId, actor);
    return this.prisma.configProfile.create({
      data: {
        name: data.name,
        description: data.description,
        payload: data.payload as object,
        enabled: data.enabled ?? true,
        nodeId: data.nodeId || null,
        // Профиль без явной организации — общий дефолт панели (создаёт ADMIN).
        organizationId:
          actor.role === Role.ADMIN ? (data.organizationId ?? null) : (actor.organizationId ?? null),
      },
    });
  }

  async update(id: string, data: Partial<ProfileData>, actor: AuthUser) {
    const found = await this.prisma.configProfile.findFirst({ where: { id, ...this.writeWhere(actor) } });
    if (!found) throw new NotFoundException('Config profile not found');
    this.assertOrganization(data, actor);
    if (data.nodeId !== undefined) await this.validateNodeId(data.nodeId, actor);
    return this.prisma.configProfile.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.payload !== undefined ? { payload: data.payload as object } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.nodeId !== undefined ? { nodeId: data.nodeId || null } : {}),
        ...(data.organizationId !== undefined ? { organizationId: data.organizationId } : {}),
      },
    });
  }

  async remove(id: string, actor: AuthUser) {
    const found = await this.prisma.configProfile.findFirst({ where: { id, ...this.writeWhere(actor) } });
    if (!found) throw new NotFoundException('Config profile not found');
    await this.prisma.configProfile.delete({ where: { id } });
    return { success: true };
  }
}

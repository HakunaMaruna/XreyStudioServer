import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type ProfileData = {
  name: string;
  description?: string;
  payload: unknown;
  enabled?: boolean;
  nodeId?: string | null;
};

@Injectable()
export class ConfigProfilesService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.configProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } }, node: { select: { id: true, name: true } } },
    });
  }

  find(id: string) {
    return this.prisma.configProfile.findUnique({ where: { id } });
  }

  private async validateNodeId(nodeId: string | null | undefined): Promise<void> {
    if (!nodeId) return;
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    // Global profiles cannot point at a tenant-owned node: that would expose its identity.
    if (!node || node.organizationId) {
      throw new BadRequestException('Unknown or organization-scoped node');
    }
  }

  async create(data: ProfileData) {
    await this.validateNodeId(data.nodeId);
    return this.prisma.configProfile.create({
      data: {
        name: data.name,
        description: data.description,
        payload: data.payload as object,
        enabled: data.enabled ?? true,
        nodeId: data.nodeId || null,
      },
    });
  }

  async update(id: string, data: Partial<ProfileData>) {
    const found = await this.find(id);
    if (!found) throw new NotFoundException('Config profile not found');
    if (data.nodeId !== undefined) await this.validateNodeId(data.nodeId);
    return this.prisma.configProfile.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.payload !== undefined ? { payload: data.payload as object } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.nodeId !== undefined ? { nodeId: data.nodeId || null } : {}),
      },
    });
  }

  async remove(id: string) {
    const found = await this.find(id);
    if (!found) throw new NotFoundException('Config profile not found');
    await this.prisma.configProfile.delete({ where: { id } });
    return { success: true };
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Live link between an inbound and a user group (squad).
 * Clients added by a link are marked with sourceSquadId so that removing
 * somebody from the group never touches manually added clients.
 */
@Injectable()
export class SquadBindingService {
  private readonly logger = new Logger(SquadBindingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(inboundId: string) {
    const links = await this.prisma.inboundSquad.findMany({
      where: { inboundId },
      orderBy: { createdAt: 'asc' },
      include: { squad: { include: { _count: { select: { users: true } } } } },
    });
    return links.map((link) => ({
      id: link.id,
      squadId: link.squadId,
      squadName: link.squad.name,
      memberCount: link.squad._count.users,
      createdAt: link.createdAt,
    }));
  }

  async bind(inboundId: string, squadId: string) {
    const inbound = await this.prisma.inbound.findUnique({ where: { id: inboundId } });
    if (!inbound) throw new NotFoundException('Inbound not found');
    const squad = await this.prisma.squad.findUnique({ where: { id: squadId } });
    if (!squad) throw new NotFoundException('Squad not found');
    await this.prisma.inboundSquad.upsert({
      where: { inboundId_squadId: { inboundId, squadId } },
      create: { inboundId, squadId },
      update: {},
    });
    await this.sync(inboundId, squadId);
    return { inboundId, squadId, bound: true };
  }

  async unbind(inboundId: string, squadId: string) {
    await this.prisma.inboundSquad.deleteMany({ where: { inboundId, squadId } });
    await this.prisma.inboundClient.deleteMany({ where: { inboundId, sourceSquadId: squadId } });
    return { inboundId, squadId, bound: false };
  }

  async unbindAll(squadId: string) {
    const links = await this.prisma.inboundSquad.findMany({ where: { squadId }, select: { inboundId: true } });
    await this.prisma.inboundSquad.deleteMany({ where: { squadId } });
    await this.prisma.inboundClient.deleteMany({ where: { sourceSquadId: squadId } });
    return links.length;
  }

  /** Sync one inbound↔squad link. Safe to call repeatedly. */
  async sync(inboundId: string, squadId: string) {
    const [members, existing] = await Promise.all([
      this.prisma.user.findMany({
        where: { squadId, status: 'ACTIVE' },
        select: { id: true },
      }),
      this.prisma.inboundClient.findMany({
        where: { inboundId, sourceSquadId: squadId },
        select: { userId: true },
      }),
    ]);
    const wanted = new Set(members.map((member) => member.id));
    const present = new Set(existing.map((client) => client.userId));
    const toAdd = [...wanted].filter((id) => !present.has(id));
    const toRemove = [...present].filter((id) => !wanted.has(id));
    if (toRemove.length) {
      await this.prisma.inboundClient.deleteMany({
        where: { inboundId, userId: { in: toRemove }, sourceSquadId: squadId },
      });
    }
    if (toAdd.length) {
      await this.prisma.inboundClient.createMany({
        data: toAdd.map((userId) => ({ inboundId, userId, sourceSquadId: squadId })),
        skipDuplicates: true,
      });
    }
    return { inboundId, squadId, added: toAdd.length, removed: toRemove.length };
  }

  /** Called after a squad's membership changed. */
  async syncSquad(squadId: string) {
    const links = await this.prisma.inboundSquad.findMany({
      where: { squadId },
      select: { inboundId: true },
    });
    const results = [];
    for (const link of links) results.push(await this.sync(link.inboundId, squadId));
    return results;
  }

  /** Called after a user's squad changed. */
  async syncUser(userId: string, previousSquadId?: string | null, nextSquadId?: string | null) {
    const ids = new Set([previousSquadId, nextSquadId].filter(Boolean) as string[]);
    const results = [];
    for (const squadId of ids) results.push(...await this.syncSquad(squadId));
    return results;
  }
}

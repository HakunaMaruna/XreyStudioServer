import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHostDto, UpdateHostDto, ApplyHostDto } from './dto/host.dto';
import { HOST_RECIPES } from './host-recipes';

@Injectable()
export class HostsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.host.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const found = await this.prisma.host.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Host not found');
    return found;
  }

  recipes() {
    return HOST_RECIPES;
  }

  create(dto: CreateHostDto) {
    return this.prisma.host.create({ data: { ...dto, enabled: dto.enabled ?? true } });
  }

  // Применяет хост (и его рецепт) к подключению: SNI, путь, transport/security
  // и публичный адрес, чтобы подписка сразу отдавала рабочую ссылку.
  async applyToInbound(hostId: string, dto: ApplyHostDto) {
    const host = await this.findOne(hostId);
    const inbound = await this.prisma.inbound.findUnique({ where: { id: dto.inboundId } });
    if (!inbound) throw new NotFoundException('Inbound not found');
    const recipe = HOST_RECIPES.find((r) => r.id === host.recipe);
    const settings = (inbound.settings || {}) as Record<string, unknown>;
    return this.prisma.inbound.update({
      where: { id: inbound.id },
      data: {
        sni: host.sni || inbound.sni,
        path: host.path || inbound.path,
        transport: recipe?.transport || inbound.transport,
        security: recipe?.security || inbound.security,
        settings: { ...settings, publicHost: host.address, ...(host.sni ? { sni: host.sni } : {}) },
      },
    });
  }

  async update(id: string, dto: UpdateHostDto) {
    await this.findOne(id);
    return this.prisma.host.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.host.delete({ where: { id } });
    return { success: true };
  }
}

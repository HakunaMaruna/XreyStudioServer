import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHostDto, UpdateHostDto } from './dto/host.dto';

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

  create(dto: CreateHostDto) {
    return this.prisma.host.create({ data: { ...dto, enabled: dto.enabled ?? true } });
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRuleDto, UpdateRuleDto } from './dto/rule.dto';

@Injectable()
export class RulesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.rule.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const found = await this.prisma.rule.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Rule not found');
    return found;
  }

  create(dto: CreateRuleDto) {
    return this.prisma.rule.create({
      data: { name: dto.name, type: dto.type, payload: dto.payload as any, enabled: dto.enabled ?? true },
    });
  }

  async update(id: string, dto: UpdateRuleDto) {
    await this.findOne(id);
    return this.prisma.rule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.payload !== undefined ? { payload: dto.payload as any } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.rule.delete({ where: { id } });
    return { success: true };
  }
}

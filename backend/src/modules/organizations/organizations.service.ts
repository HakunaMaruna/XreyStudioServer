// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, nodes: true } } },
    });
  }

  async findOne(id: string) {
    const found = await this.prisma.organization.findUnique({
      where: { id },
      include: { _count: { select: { users: true, nodes: true } } },
    });
    if (!found) throw new NotFoundException('Organization not found');
    return found;
  }

  create(dto: CreateOrganizationDto) {
    return this.prisma.organization.create({
      data: { name: dto.name, slug: dto.slug, branding: dto.branding as any },
    });
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    await this.findOne(id);
    return this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.branding !== undefined ? { branding: dto.branding as any } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.organization.delete({ where: { id } });
    return { success: true };
  }
}

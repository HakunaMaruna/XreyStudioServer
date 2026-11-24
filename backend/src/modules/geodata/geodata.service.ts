import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GEODATA_CATALOG } from './catalog';

@Injectable()
export class GeodataService implements OnModuleInit {
  private readonly logger = new Logger(GeodataService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seed();
  }

  async seed() {
    const result = await this.prisma.geodataCategory.createMany({
      data: GEODATA_CATALOG,
      skipDuplicates: true,
    });
    this.logger.log(`Geodata catalog: ${GEODATA_CATALOG.length} categories available (${result.count} new)`);
    return { total: GEODATA_CATALOG.length, added: result.count };
  }

  list(query: { type?: string; search?: string; enabled?: string }) {
    const search = query.search?.trim().toLowerCase();
    return this.prisma.geodataCategory.findMany({
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.enabled !== undefined ? { enabled: query.enabled === 'true' } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });
  }

  async create(data: { type: string; code: string; name: string; description?: string; enabled?: boolean }) {
    const type = String(data.type || '').toLowerCase();
    if (!['geosite', 'geoip'].includes(type)) throw new ConflictException('type must be geosite or geoip');
    const code = String(data.code || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!code) throw new ConflictException('code is required');
    const existing = await this.prisma.geodataCategory.findUnique({ where: { type_code: { type, code } } });
    if (existing) throw new ConflictException('Category already exists');
    return this.prisma.geodataCategory.create({
      data: {
        type,
        code,
        name: data.name,
        description: data.description,
        enabled: data.enabled ?? true,
        source: 'custom',
      },
    });
  }

  async update(id: string, data: { name?: string; description?: string; enabled?: boolean }) {
    const found = await this.prisma.geodataCategory.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Category not found');
    return this.prisma.geodataCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      },
    });
  }

  async remove(id: string) {
    const found = await this.prisma.geodataCategory.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Category not found');
    await this.prisma.geodataCategory.delete({ where: { id } });
    return { success: true };
  }

  ruleSnippet(type: string, code: string) {
    return `"${type}:${code}"`;
  }
}

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = (this.config.get<string>('ADMIN_EMAIL') || 'admin@example.com').toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD') || 'admin12345';
    const existing = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (existing) return;

    let organization = await this.prisma.organization.findFirst({ where: { slug: 'default' } });
    if (!organization) {
      organization = await this.prisma.organization.create({
        data: { name: 'Default', slug: 'default' },
      });
    }

    await this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });
    this.logger.log(`Created default admin: ${email}`);
  }
}

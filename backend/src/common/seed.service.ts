import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { getBootstrapAdminPassword } from './env';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private passwords: PasswordService,
  ) {}

  async onApplicationBootstrap() {
    const email = (this.config.get<string>('ADMIN_EMAIL') || 'admin@example.com').toLowerCase();
    const password = getBootstrapAdminPassword();
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
        passwordHash: await this.passwords.hash(password),
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });
    this.logger.log(`Created default admin: ${email}`);
  }
}

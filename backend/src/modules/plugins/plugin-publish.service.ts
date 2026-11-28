// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PluginCatalogService } from './plugin-catalog.service';
import { PluginPackage, reviewPackage, reviewPackage as check, sha256Package, signPackage, validatePackage } from './plugin-package';

export type PublishDto = {
  pkg: PluginPackage;
  name?: string;
  author?: string;
  description?: string;
  category?: string;
  iconUrl?: string;
  screenshots?: unknown;
  changelog?: string;
};

/** Master-only flow: validate → static review → sign → submit to store moderation. */
@Injectable()
export class PluginPublishService {
  constructor(
    private readonly catalog: PluginCatalogService,
    private readonly audit: AuditService,
  ) {}

  private assertAdmin(actor?: AuthUser) {
    if (!actor || actor.role !== Role.ADMIN) throw new ForbiddenException('Admin role required');
  }

  review(pkg: PluginPackage) {
    const value = validatePackage(pkg);
    return { findings: reviewPackage(value), sha256: sha256Package(value) };
  }

  async submit(dto: PublishDto, actor?: AuthUser) {
    this.assertAdmin(actor);
    const value = validatePackage(dto.pkg);
    const findings = check(value);
    const blocking = findings.filter((item) => item.level === 'blocking');
    if (blocking.length) throw new BadRequestException(`Package rejected by static review: ${blocking.map((item) => item.message).join('; ')}`);

    const privateKey = process.env.PLUGIN_STORE_PRIVATE_KEY;
    if (!privateKey) throw new ForbiddenException('PLUGIN_STORE_PRIVATE_KEY is not configured');
    const signed = signPackage(value, privateKey);
    const manifest = value.manifest;

    const published = await this.catalog.publishToStore({
      slug: manifest.id,
      name: dto.name || manifest.name,
      author: dto.author || manifest.author,
      description: dto.description || manifest.description,
      category: dto.category || 'utility',
      iconUrl: dto.iconUrl || null,
      screenshots: dto.screenshots || null,
      changelog: dto.changelog || null,
      status: 'REVIEW',
      pkg: signed,
    });
    await this.catalog.createReview({
      pluginId: manifest.id,
      version: manifest.version,
      developer: actor?.email || 'admin',
      checks: findings,
    });
    await this.audit.log({
      userId: actor?.userId,
      action: 'plugin.submitForReview',
      entity: 'Plugin',
      entityId: manifest.id,
      metadata: { version: manifest.version, sha256: sha256Package(value), findings: findings.length },
    });
    return { ...published, findings };
  }

  async listReviews(actor?: AuthUser) {
    this.assertAdmin(actor);
    return this.catalog.reviews();
  }

  async decide(id: string, body: { status: string; note?: string }, actor?: AuthUser) {
    this.assertAdmin(actor);
    const result = await this.catalog.decideReview(id, { ...body, reviewer: actor?.email || 'admin' });
    await this.audit.log({
      userId: actor?.userId,
      action: `plugin.review.${body.status.toLowerCase()}`,
      entity: 'Plugin',
      entityId: id,
      metadata: { note: body.note || null },
    });
    return result;
  }
}

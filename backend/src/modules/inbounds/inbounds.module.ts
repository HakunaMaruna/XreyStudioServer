// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 HakunaMaruna
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PluginsModule } from '../plugins/plugins.module';
import { UserGroupsModule } from '../user-groups/user-groups.module';
import { InboundRecipesService } from './inbound-recipes.service';
import { InboundsController } from './inbounds.controller';
import { InboundsService } from './inbounds.service';
import { SquadBindingService } from './squad-binding.service';

@Module({
  imports: [AuditModule, PluginsModule, UserGroupsModule],
  controllers: [InboundsController],
  providers: [InboundsService, InboundRecipesService, SquadBindingService],
  exports: [InboundsService, SquadBindingService],
})
export class InboundsModule {}

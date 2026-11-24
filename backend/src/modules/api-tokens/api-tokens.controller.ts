import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTokenScope, Role } from '@prisma/client';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiTokensService } from './api-tokens.service';
import { ApiTokenGuard, ApiTokenUser, RequireScope } from './api-token.guard';

class CreateApiTokenDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsArray()
  @IsIn(Object.values(ApiTokenScope), { each: true })
  scopes!: ApiTokenScope[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

@Controller('api-tokens')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
export class ApiTokensController {
  constructor(private tokens: ApiTokensService) {}

  @Post()
  create(@Body() dto: CreateApiTokenDto, @CurrentUser() user: AuthUser) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('expiresAt must be an ISO date');
    }
    return this.tokens.create({
      name: dto.name,
      scopes: dto.scopes,
      organizationId: dto.organizationId ?? user.organizationId ?? null,
      expiresAt,
      actor: { userId: user.userId, role: user.role as Role, organizationId: user.organizationId },
    });
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.tokens.list(user.role === Role.ADMIN ? null : (user.organizationId ?? null));
  }

  @Delete(':id')
  revoke(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.tokens.revoke(id, {
      role: user.role as Role,
      organizationId: user.organizationId,
    });
  }
}

@Controller('monitor')
export class MonitorController {
  constructor(private prisma: PrismaService) {}

  @Get('summary')
  @UseGuards(ApiTokenGuard)
  @RequireScope(ApiTokenScope.MONITOR)
  async summary(@ApiTokenUser() token: { organizationId: string | null }) {
    const org = token.organizationId ?? undefined;
    const [users, nodes, alerts] = await Promise.all([
      this.prisma.user.count({ where: org ? { organizationId: org } : {} }),
      this.prisma.node.count({ where: org ? { organizationId: org } : {} }),
      this.prisma.alertHistory.count(),
    ]);
    return {
      users,
      nodes,
      alerts,
      generatedAt: new Date().toISOString(),
    };
  }
}

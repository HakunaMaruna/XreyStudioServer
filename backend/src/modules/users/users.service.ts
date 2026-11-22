import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { BulkUsersDto, CreateUserDto, UpdateUserDto, UsersQueryDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private tenantWhere(user: AuthUser): Prisma.UserWhereInput {
    if (user.role === Role.ADMIN) return {};
    return { organizationId: user.organizationId || '__none__' };
  }

  async findAll(query: UsersQueryDto, user: AuthUser) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: Prisma.UserWhereInput = {
      ...this.tenantWhere(user),
      ...(query.status ? { status: query.status } : {}),
      ...(query.role ? { role: query.role as Role } : {}),
      ...(query.search
        ? { email: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          trafficLimit: true,
          trafficUsed: true,
          expiresAt: true,
          subscriptionToken: true,
          organizationId: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string, user: AuthUser) {
    const found = await this.prisma.user.findFirst({
      where: { id, ...this.tenantWhere(user) },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        trafficLimit: true,
        trafficUsed: true,
        expiresAt: true,
        subscriptionToken: true,
        organizationId: true,
        createdAt: true,
        inbounds: true,
      },
    });
    if (!found) throw new NotFoundException('User not found');
    return found;
  }

  async create(dto: CreateUserDto, actor: AuthUser) {
    if (dto.role === Role.ADMIN && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can create admins');
    }
    const email = dto.email.toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException('Email already exists');

    return this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        role: dto.role || Role.USER,
        status: dto.status || UserStatus.ACTIVE,
        trafficLimit: BigInt(dto.trafficLimit || 0),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        organizationId: dto.organizationId || actor.organizationId || null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        subscriptionToken: true,
        trafficLimit: true,
        trafficUsed: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    await this.findOne(id, actor);
    if (dto.role === Role.ADMIN && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can promote to admin');
    }
    const data: Prisma.UserUpdateInput = {};
    if (dto.email) data.email = dto.email.toLowerCase();
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);
    if (dto.role) data.role = dto.role;
    if (dto.status) data.status = dto.status;
    if (dto.trafficLimit !== undefined) data.trafficLimit = BigInt(dto.trafficLimit);
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.organizationId !== undefined) {
      data.organization = dto.organizationId
        ? { connect: { id: dto.organizationId } }
        : { disconnect: true };
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        trafficLimit: true,
        trafficUsed: true,
        expiresAt: true,
        organizationId: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string, actor: AuthUser) {
    await this.findOne(id, actor);
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  async bulk(dto: BulkUsersDto, actor: AuthUser) {
    if (!dto.ids?.length) throw new BadRequestException('No ids provided');
    const where = { id: { in: dto.ids }, ...this.tenantWhere(actor) };
    switch (dto.action) {
      case 'disable':
        return this.prisma.user.updateMany({ where, data: { status: UserStatus.DISABLED } });
      case 'enable':
        return this.prisma.user.updateMany({ where, data: { status: UserStatus.ACTIVE } });
      case 'resetTraffic':
        return this.prisma.user.updateMany({ where, data: { trafficUsed: BigInt(0) } });
      case 'delete':
        return this.prisma.user.deleteMany({ where });
      default:
        throw new BadRequestException('Unknown action');
    }
  }

  async stats(actor: AuthUser) {
    const where = this.tenantWhere(actor);
    const [total, active, expired, disabled, traffic] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...where, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { ...where, expiresAt: { lt: new Date() } } }),
      this.prisma.user.count({ where: { ...where, status: UserStatus.DISABLED } }),
      this.prisma.user.aggregate({ where, _sum: { trafficUsed: true } }),
    ]);
    return {
      total,
      active,
      expired,
      disabled,
      trafficUsed: traffic._sum.trafficUsed?.toString() || '0',
    };
  }
}
